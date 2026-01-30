import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../errors/AppError.js';
import { ContractProvider, DadosContrato, SignatureMetadata } from '../types/contract.js';
import { CreateContractDTO, ListContractsDTO } from '../types/dtos/contract.dto.js';
import { ContratoStatus } from '../types/enums.js';
import { getFirstName } from '../utils/format.js';
import { InHouseContractProvider } from './providers/inhouse-contract.provider.js';
import { whatsappService } from './whatsapp.service.js';

class ContractService {
  private providers: Map<string, ContractProvider> = new Map();

  constructor() {
    this.providers.set('inhouse', new InHouseContractProvider());
  }

  private getProvider(providerName: string): ContractProvider {
    const provider = this.providers.get(providerName);
    if (!provider) throw new AppError(`Provider ${providerName} não encontrado`, 404);
    return provider;
  }

  private async getUsuarioByAuthId(authId: string) {
    const { data: usuario, error } = await supabaseAdmin
      .from('usuarios')
      .select('*')
      .eq('auth_uid', authId)
      .single();
    
    if (error || !usuario) {
      logger.error({ authId, error }, 'Usuário não encontrado por auth_uid');
      throw new AppError('Usuário não encontrado', 404);
    }
    return usuario;
  }

  async criarContrato(authId: string, data: CreateContractDTO) {
    const { passageiroId, provider: providerName = 'inhouse', ...customTerms } = data;
    
    // 1. Resolver usuário (condutor)
    const usuario = await this.getUsuarioByAuthId(authId);
    const usuarioId = usuario.id;

    logger.info({ usuarioId: usuario.id, passageiroId, providerName }, 'Criando contrato');

    // 2. Buscar dados do passageiro
    const { data: passageiro, error: passageiroError } = await supabaseAdmin
      .from('passageiros')
      .select(`
        *,
        escola:escolas(*),
        veiculo:veiculos(*)
      `)
      .eq('id', passageiroId)
      .eq('usuario_id', usuarioId)
      .single();
    
    if (passageiroError || !passageiro) {
      logger.error({ passageiroError }, 'Passageiro não encontrado');
      throw new AppError('Passageiro não encontrado', 404);
    }
    
    // 3. Cálculos dinâmicos
    const hoje = new Date();
    const anoVigente = hoje.getFullYear();
    const mesAtual = hoje.getMonth() + 1;
    
    const qtdParcelas = 12 - mesAtual + 1;
    const valorMensal = customTerms.valorMensal || Number(passageiro.valor_cobranca);
    const valorTotal = valorMensal * qtdParcelas;
    
    const dataInicio = customTerms.dataInicio || hoje.toISOString().split('T')[0];
    const dataFim = `${anoVigente}-12-31`;
    
    // 4. Preparar dados do contrato
    const dadosContrato: DadosContrato = {
      nomePassageiro: passageiro.nome,
      nomeResponsavel: passageiro.nome_responsavel,
      cpfResponsavel: passageiro.cpf_responsavel,
      telefoneResponsavel: passageiro.telefone_responsavel,
      emailResponsavel: passageiro.email_responsavel,
      enderecoCompleto: `${passageiro.logradouro}, ${passageiro.numero} - ${passageiro.bairro}, ${passageiro.cidade}/${passageiro.estado}`,
      nomeEscola: passageiro.escola.nome,
      enderecoEscola: `${passageiro.escola.logradouro}, ${passageiro.escola.numero} - ${passageiro.escola.bairro}`,
      periodo: passageiro.periodo,
      modalidade: customTerms.modalidade || passageiro.modalidade || 'Ida e Volta',
      valorMensal: valorMensal,
      diaVencimento: customTerms.diaVencimento || passageiro.dia_vencimento,
      
      ano: anoVigente,
      dataInicio: customTerms.dataInicio || passageiro.data_inicio_transporte || hoje.toISOString().split('T')[0],
      dataFim,
      valorTotal,
      qtdParcelas,
      valorParcela: valorMensal,
      multaAtraso: usuario.config_contrato?.multa_atraso || { valor: 10, tipo: 'percentual' },
      multaRescisao: usuario.config_contrato?.multa_rescisao || { valor: 15, tipo: 'percentual' },
      nomeCondutor: usuario.nome,
      cpfCnpjCondutor: usuario.cpfcnpj,
      telefoneCondutor: usuario.telefone,
      placaVeiculo: passageiro.veiculo.placa,
      modeloVeiculo: `${passageiro.veiculo.marca} ${passageiro.veiculo.modelo}`,
      clausulas: usuario.config_contrato?.clausulas,
      assinaturaCondutorUrl: usuario.assinatura_url,
    };
    
    // 5. Gerar token único e criar registro
    const tokenAcesso = uuidv4();
    
    const { data: contrato, error: contratoError } = await supabaseAdmin
      .from('contratos')
      .insert({
        usuario_id: usuarioId,
        passageiro_id: passageiroId,
        token_acesso: tokenAcesso,
        provider: providerName,
        dados_contrato: dadosContrato,
        status: ContratoStatus.PENDENTE,
        ano: anoVigente,
        data_inicio: dataInicio,
        data_fim: dataFim,
        valor_total: valorTotal,
        qtd_parcelas: qtdParcelas,
        valor_parcela: valorMensal,
        dia_vencimento: dadosContrato.diaVencimento,
        multa_atraso_valor: dadosContrato.multaAtraso.valor,
        multa_atraso_tipo: dadosContrato.multaAtraso.tipo,
        multa_rescisao_valor: dadosContrato.multaRescisao.valor,
        multa_rescisao_tipo: dadosContrato.multaRescisao.tipo,
      })
      .select()
      .single();
    
    if (contratoError) throw contratoError;
    
    // 6. Gerar contrato provider
    const provider = this.getProvider(providerName);
    const response = await provider.gerarContrato({
      contratoId: contrato.id,
      dadosContrato,
    });
    
    await supabaseAdmin
      .from('contratos')
      .update({
        minuta_url: response.documentUrl,
        provider_document_id: response.providerDocumentId,
        provider_link_assinatura: response.providerSignatureLink,
      })
      .eq('id', contrato.id);
    
    logger.info({ contratoId: contrato.id }, 'Contrato criado com sucesso');
    
    const linkAssinatura = providerName === 'inhouse' 
      ? `${env.FRONT_URL_RESPONSAVEL || env.FRONTEND_URL}/assinar/${tokenAcesso}`
      : response.providerSignatureLink;

    if (passageiro.telefone_responsavel) {
      const mensagem = `Olá ${getFirstName(passageiro.nome_responsavel)}, o contrato do passageiro ${getFirstName(passageiro.nome)} para ${anoVigente} está pronto. Assine aqui: ${linkAssinatura}`;
      whatsappService.sendText(passageiro.telefone_responsavel, mensagem)
        .catch(err => logger.error({ err }, 'Erro ao enviar WhatsApp do contrato'));
    }
    
    return { ...contrato, minuta_url: response.documentUrl, linkAssinatura };
  }

  async processarAssinatura(tokenAcesso: string, assinaturaBase64: string, metadados: SignatureMetadata) {
    logger.info({ tokenAcesso }, 'Processando assinatura');

    // 1. Buscar contrato
    const { data: contrato, error } = await supabaseAdmin
      .from('contratos')
      .select('*, usuario:usuarios(*), passageiro:passageiros(*)')
      .eq('token_acesso', tokenAcesso)
      .single();

    
    if (error || !contrato) {
      logger.error({ error }, 'Contrato não encontrado');
      throw new AppError('Contrato não encontrado', 404);
    }
    
    if (contrato.status !== ContratoStatus.PENDENTE) {
      throw new AppError('Contrato já foi assinado ou cancelado', 400);
    }
    
    // 2. Processar assinatura usando provider
    const provider = this.getProvider(contrato.provider);
    const response = await provider.processarAssinatura({
      contratoId: contrato.id,
      assinaturaBase64,
      metadados,
    });
    
    // 3. Atualizar status
    await supabaseAdmin
      .from('contratos')
      .update({
        status: ContratoStatus.ASSINADO,
        contrato_final_url: response.documentoFinalUrl,
        assinado_em: response.assinadoEm,
        assinatura_metadados: metadados,
      })
      .eq('id', contrato.id);
    
    logger.info({ contratoId: contrato.id }, 'Contrato assinado com sucesso');
    
    // 4. Notificar via WhatsApp
    const { usuario, passageiro } = contrato;
    
    // 4.1 Notificar Responsável
    if (passageiro.telefone_responsavel) {
      const msgResponsavel = `Olá ${passageiro.nome_responsavel}! Seu contrato de transporte escolar para *${passageiro.nome}* foi assinado com sucesso.\n\n` +
          `Você pode visualizar o documento final no link abaixo:\n` +
          `${response.documentoFinalUrl}`;
      
      whatsappService.sendText(passageiro.telefone_responsavel, msgResponsavel)
        .catch(err => logger.error({ err }, 'Erro ao notificar responsável sobre assinatura'));
    }
    
    // 4.2 Notificar Motorista
    if (usuario.telefone) {
      const msgMotorista = `✅ *Contrato Assinado!*\n\n` +
          `O responsável do passageiro *${getFirstName(passageiro.nome)}*, *${getFirstName(passageiro.nome_responsavel)}*, acaba de assinar o contrato do passageiro *${passageiro.nome}*.\n\n` +
          `Acesse o documento assinado aqui:\n` +
          `${response.documentoFinalUrl}`;
      
      whatsappService.sendText(usuario.telefone, msgMotorista)
        .catch(err => logger.error({ err }, 'Erro ao notificar motorista sobre assinatura'));
    }
    
    return response;

  }

  async consultarContrato(tokenAcesso: string) {
    const { data, error } = await supabaseAdmin
      .from('contratos')
      .select('*')
      .eq('token_acesso', tokenAcesso)
      .single();
    
    if (error) throw error;
    return data;
  }

  async listarContratos(authId: string, filters: ListContractsDTO) {
    const usuario = await this.getUsuarioByAuthId(authId);
    const usuarioId = usuario.id;

    let query = supabaseAdmin
      .from('contratos')
      .select('*, passageiro:passageiros(nome, nome_responsavel)', { count: 'exact' })
      .eq('usuario_id', usuarioId)
      .order('created_at', { ascending: false });
    
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    
    if (filters.passageiroId) {
      query = query.eq('passageiro_id', filters.passageiroId);
    }
    
    const from = (filters.page - 1) * filters.limit;
    const to = from + filters.limit - 1;
    
    query = query.range(from, to);
    
    const { data, error, count } = await query;
    
    if (error) throw error;
    
    return {
      data,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / filters.limit),
      },
    };
  }

  async cancelarContrato(contratoId: string, authId: string) {
    const usuario = await this.getUsuarioByAuthId(authId);
    const usuarioId = usuario.id;

    const { data: contrato } = await supabaseAdmin
      .from('contratos')
      .select('provider')
      .eq('id', contratoId)
      .eq('usuario_id', usuarioId)
      .single();
    
    if (!contrato) throw new AppError('Contrato não encontrado', 404);
    
    const provider = this.getProvider(contrato.provider);
    await provider.cancelarContrato(contratoId);
    
    logger.info({ contratoId }, 'Contrato cancelado');
    
    return { success: true };
  }

  async baixarContrato(contratoId: string, authId: string) {
    const usuario = await this.getUsuarioByAuthId(authId);
    const usuarioId = usuario.id;

    const { data: contrato } = await supabaseAdmin
      .from('contratos')
      .select('provider')
      .eq('id', contratoId)
      .eq('usuario_id', usuarioId)
      .single();
    
    if (!contrato) throw new AppError('Contrato não encontrado', 404);
    
    const provider = this.getProvider(contrato.provider);
    return provider.baixarDocumento(contratoId);
  }

  async gerarPreview(authId: string, draftConfig?: any) {
    // 1. Buscar dados do usuário (condutor) pelo auth_uid
    // Note: We search by auth_uid because the controller passes req.user.id
    const { data: usuario, error: usuarioError } = await supabaseAdmin
      .from('usuarios')
      .select('*')
      .eq('auth_uid', authId)
      .single();
    
    // Fallback: verification if we somehow received a UUID and not Auth ID (just in case)
    if (usuarioError || !usuario) {
       // Try by ID as fallback? No, better to be strict or log error
       logger.error({ authId, usuarioError }, 'Usuário não encontrado para preview');
       throw new AppError('Usuário não encontrado', 404);
    }

    const hoje = new Date();
    const anoVigente = hoje.getFullYear();

    // 2. Dados Fictícios para o Preview MERGED com o Draft Config
    // Prioridade: Draft > Config Salva > Default
    const config = draftConfig || {};
    const savedConfig = usuario.config_contrato || {};

    const multaAtraso = config.multaAtraso || savedConfig.multa_atraso || { valor: 10, tipo: 'percentual' };
    const multaRescisao = config.multaRescisao || savedConfig.multa_rescisao || { valor: 15, tipo: 'percentual' };
    const clausulas = config.clausulas || savedConfig.clausulas || [
        "O serviço consiste no transporte do passageiro no trajeto acordado.",
        "O pagamento deve ser efetuado até o dia de vencimento escolhido."
    ];

    const dadosContrato: DadosContrato = {
      nomePassageiro: "Passageiro Exemplo da Silva",
      nomeResponsavel: "Responsável Fictício de Souza",
      cpfResponsavel: "000.000.000-00",
      telefoneResponsavel: "(11) 99999-9999",
      emailResponsavel: "exemplo@email.com",
      enderecoCompleto: "Rua das Flores, 123 - Centro, Cidade/EST",
      nomeEscola: "Escola Municipal de Exemplo",
      enderecoEscola: "Av. Principal, 456 - Bairro",
      periodo: "Manhã",
      modalidade: 'Ida e Volta',
      valorMensal: 200,
      diaVencimento: 10,
      ano: anoVigente,
      dataInicio: hoje.toISOString().split('T')[0],
      dataFim: `${anoVigente}-12-31`,
      valorTotal: 2400,
      qtdParcelas: 12,
      valorParcela: 200,
      
      multaAtraso,
      multaRescisao,
      
      nomeCondutor: usuario.nome,
      cpfCnpjCondutor: usuario.cpfcnpj,
      telefoneCondutor: usuario.telefone,
      placaVeiculo: "ABC-1234",
      modeloVeiculo: "Mercedes Sprinter",
      
      clausulas,
      
      assinaturaCondutorUrl: config.assinaturaCondutorUrl || usuario.assinatura_url,
      apelidoCondutor: usuario.apelido,
    };

    // 3. Gerar PDF temporário usando o provider InHouse
    const provider = this.getProvider('inhouse') as InHouseContractProvider;
    const pdfDoc = await provider.criarPdfBase(dadosContrato);
    return pdfDoc.save();
  }
}

export const contractService = new ContractService();
