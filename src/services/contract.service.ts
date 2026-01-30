import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../errors/AppError.js';
import { ContractProvider, DadosContrato, SignatureMetadata } from '../types/contract.js';
import { CreateContractDTO, ListContractsDTO } from '../types/dtos/contract.dto.js';
import { ContractMultaTipo, ContratoProvider, ContratoStatus, PassageiroModalidade, PeriodoEnum } from '../types/enums.js';
import { formatAddress, getFirstName } from '../utils/format.js';
import { InHouseContractProvider } from './providers/inhouse-contract.provider.js';
import { whatsappService } from './whatsapp.service.js';

class ContractService {
  private providers: Map<string, ContractProvider> = new Map();

  constructor() {
    this.providers.set(ContratoProvider.INHOUSE, new InHouseContractProvider());
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
    const { passageiroId, provider: providerName = ContratoProvider.INHOUSE, ...customTerms } = data;
    
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
    
    // 3. Cálculos dinâmicos (Default: 12 meses seguindo o ano escolar)
    const hoje = new Date();
    const dataInicio = customTerms.dataInicio || passageiro.data_inicio_transporte || hoje.toISOString().split('T')[0];
    
    // Período padrão de 12 meses (ou o que o usuário definir)
    const qtdParcelas = customTerms.qtdParcelas || 12;
    const valorMensal = customTerms.valorMensal || Number(passageiro.valor_cobranca);
    const valorTotal = valorMensal * qtdParcelas;
    
    // Calcular data fim baseada em data início + (qtdParcelas - 1) meses para terminar no final do ciclo
    const dInicio = new Date(dataInicio + 'T12:00:00');
    const dFim = new Date(dInicio);
    dFim.setMonth(dInicio.getMonth() + qtdParcelas);
    dFim.setDate(0); // Último dia do mês anterior ao mês do vencimento final
    const dataFim = customTerms.dataFim || dFim.toISOString().split('T')[0];
    
    // 4. Preparar dados do contrato
    const dadosContrato: DadosContrato = {
      nomePassageiro: passageiro.nome,
      nomeResponsavel: passageiro.nome_responsavel,
      cpfResponsavel: passageiro.cpf_responsavel,
      telefoneResponsavel: passageiro.telefone_responsavel,
      emailResponsavel: passageiro.email_responsavel,
      parentescoResponsavel: passageiro.parentesco_responsavel,
      enderecoCompleto: formatAddress(passageiro),
      nomeEscola: passageiro.escola.nome,
      enderecoEscola: formatAddress(passageiro.escola),
      periodo: passageiro.periodo,
      modalidade: customTerms.modalidade || passageiro.modalidade || 'ida_volta',
      valorMensal: valorMensal,
      diaVencimento: customTerms.diaVencimento || passageiro.dia_vencimento,
      
      ano: dInicio.getFullYear(),
      dataInicio,
      dataFim,
      valorTotal,
      qtdParcelas,
      valorParcela: valorMensal,
      multaAtraso: usuario.config_contrato?.multa_atraso || { valor: 10, tipo: ContractMultaTipo.PERCENTUAL },
      multaRescisao: usuario.config_contrato?.multa_rescisao || { valor: 15, tipo: ContractMultaTipo.PERCENTUAL },
      nomeCondutor: usuario.nome,
      cpfCnpjCondutor: usuario.cpfcnpj,
      telefoneCondutor: usuario.telefone,
      placaVeiculo: passageiro.veiculo.placa,
      modeloVeiculo: `${passageiro.veiculo.marca} ${passageiro.veiculo.modelo}`,
      clausulas: usuario.config_contrato?.clausulas,
      assinaturaCondutorUrl: usuario.assinatura_url,
      apelidoCondutor: usuario.apelido,
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
        ano: dInicio.getFullYear(),
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
    
    const linkAssinatura = providerName === ContratoProvider.INHOUSE 
      ? `${env.FRONT_URL_RESPONSAVEL || env.FRONTEND_URL}/assinar/${tokenAcesso}`
      : response.providerSignatureLink;

    if (passageiro.telefone_responsavel) {
      const nomeResponsavel = getFirstName(passageiro.nome_responsavel);
      const mensagem = `Oi *${nomeResponsavel}*! Tudo bem? 👋\n\n` +
        `Estou enviando o contrato de transporte escolar do(a) passageiro(a) *${passageiro.nome}* para assinatura digital.\n\n` +
        `👉 Acesse o link abaixo para visualizar e assinar:\n\n` +
        `${linkAssinatura}\n\n` +
        `O contrato terá validade após a assinatura de ambas as partes.\n\n` +
        `🤝 Fico à disposição em caso de dúvidas.`;
        
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
      const msgResponsavel = `✅ *Contrato Assinado!*\n\n` +
          `Oi *${getFirstName(passageiro.nome_responsavel)}*! Seu contrato de transporte escolar para *${getFirstName(passageiro.nome)}* foi assinado com sucesso.\n\n` +
          `Você pode visualizar o documento final no link abaixo:\n\n` +
          `${response.documentoFinalUrl}\n\n` +
          `Desejamos uma ótima parceria! 🚀`;
      
      whatsappService.sendText(passageiro.telefone_responsavel, msgResponsavel)
        .catch(err => logger.error({ err }, 'Erro ao notificar responsável sobre assinatura'));
    }
    
    // 4.2 Notificar Motorista
    if (usuario.telefone) {
      const msgMotorista = `✅ *Contrato Assinado!*\n\n` +
          `*${getFirstName(passageiro.nome_responsavel)}* acabou de assinar o contrato do passageiro *${getFirstName(passageiro.nome)}*.\n\n` +
          `Acesse o documento assinado aqui:\n\n` +
          `${response.documentoFinalUrl}\n\n` +
          `Bora rodar! 🚐💨`;
      
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

    const multaAtraso = config.multaAtraso || savedConfig.multa_atraso || { valor: 10, tipo: ContractMultaTipo.PERCENTUAL };
    const multaRescisao = config.multaRescisao || savedConfig.multa_rescisao || { valor: 15, tipo: ContractMultaTipo.PERCENTUAL };
    const clausulas = config.clausulas || savedConfig.clausulas || [
        "O serviço contratado consiste no transporte do passageiro acima citado, no trajeto com origem e destino acordado entre as partes.",
        "Somente o passageiro CONTRATANTE está autorizado a utilizar-se do objeto deste contrato, sendo vedado o passageiro se fazer acompanhar de colegas, parentes, amigos e etc.",
        "O transporte ora contratado se refere exclusivamente ao horário regular da escola pré-determinado, não sendo de responsabilidade da CONTRATADA o transporte do passageiro em turno diferente do contratado, em horários de atividades extracurriculares ou que por determinação da escola seja alterado.",
        "O procedimento de retirada e entrega do passageiro na residência ou local combinado deverá ser acordado entre as partes, definindo um responsável para acompanhar o passageiro.",
        "A partir do momento que for realizada a entrega do passageiro na escola, a CONTRATADA não é mais responsável pela segurança do passageiro, bem como de seus pertences.",
        "As partes deverão respeitar os horários previamente combinados de saída dos locais de origem e destino, ficando estabelecido que, caso ocorra mudança no local de origem, destino ou retorno, a CONTRATADA reserva-se o direito de aceitar ou não tais alterações, em razão da modificação de rota, podendo, inclusive, ficar desobrigada da prestação dos serviços previstos neste contrato.",
        "Fica estabelecido que, caso a CONTRATANTE ou algum outro responsável pelo passageiro for buscá-lo no lugar da CONTRATADA, a CONTRATANTE deverá comunicar à CONTRATADA e à escola previamente.",
        "A CONTRATANTE obriga-se a informar a CONTRATADA com um prazo de até duas horas antes do horário se o passageiro não for comparecer à escola naquele dia.",
        "Está proibido o consumo de alimentos no interior do veículo escolar, com a finalidade de evitar e prevenir acidentes, como engasgos, ou constrangimento de outros passageiros, além de manter a limpeza do veículo.",
        "Para os efeitos deste contrato, o transporte pactuado ficará temporariamente suspenso no caso de o passageiro apresentar doença infectocontagiosa, visando preservar a saúde e a segurança das crianças transportadas e dos prestadores do serviço.",
        "O veículo passa por duas vistorias anuais ( uma em cada semestre), onde nesse dia não haverá transporte e assim visando a segurança do mesmo. Avisaremos com antecedência a data das vistorias.",
        "A CONTRATANTE pagará à CONTRATADA o valor total de R$ 2280,00 (dois mil e duzentos e oitenta reais), conforme forma de pagamento e parcelamento previamente acordados entre as partes, sendo o pagamento devido integralmente e de forma regular inclusive durante os períodos de férias dos meses de julho, dezembro e janeiro, bem como em casos de recessos, greves, afastamento temporário do passageiro por motivo de doença, férias, viagens, pandemia ou qualquer outro motivo, inclusive de força maior.",
        "As parcelas deverão ser pagas até o dia estabelecido nas CONDIÇÕES DE VALOR, durante todo o período de vigência do contrato. Em caso de atraso no pagamento, a CONTRATANTE poderá estar sujeita à multa prevista nas CONDIÇÕES DE VALOR, sendo que, após a notificação do atraso, a CONTRATADA poderá conceder um prazo para regularização. Persistindo o não pagamento da parcela em atraso, a prestação do serviço poderá ser suspensa até que a situação seja regularizada.",
        "Início do ano terá reajuste da mensalidade e um novo contrato será emitido.",
        "Em caso de comportamento inadequado, desobediência às normas de segurança ou atitude antissocial, o passageiro poderá sofrer advertência por escrito e, em caso de reincidência, ocorrerá a rescisão do contrato motivada.",
        "O contrato pode ser rescindido imotivadamente por qualquer das partes, com aplicação de multa rescisória conforme percentual descrito nas condições de valor sobre as parcelas pendentes, exceto quando a rescisão for motivada.",
        "É convencionado que a CONTRATADA não será responsabilizada pela vigilância de objetos pessoais, material escolar, dinheiro, joias ou quaisquer pertences eventualmente esquecidos pelo passageiro no veículo ou no estabelecimento escolar.",
        "As partes reconhecem o presente contrato como título executivo extrajudicial nos termos do artigo 784, XI, do Código de Processo Civil, sem prejuízo da opção pelo processo de conhecimento para obtenção de título executivo judicial, nos termos do artigo 785.",
        "O serviço do transporte escolar será prestado até o dia 15 de Dezembro."
    ];

    const dadosContrato: DadosContrato = {
      nomePassageiro: "Passageiro Exemplo da Silva",
      nomeResponsavel: "Responsável Fictício de Souza",
      cpfResponsavel: "000.000.000-00",
      telefoneResponsavel: "(11) 99999-9999",
      emailResponsavel: "exemplo@email.com",
      parentescoResponsavel: "pai",
      enderecoCompleto: "Rua das Flores, 123 - Centro, Cidade/EST",
      nomeEscola: "Escola Municipal de Exemplo",
      enderecoEscola: "Av. Principal, 456 - Bairro",
      periodo: PeriodoEnum.MANHA,
      modalidade: PassageiroModalidade.IDA_VOLTA,
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
    const provider = this.getProvider(ContratoProvider.INHOUSE) as InHouseContractProvider;
    const pdfDoc = await provider.criarPdfBase(dadosContrato);
    return pdfDoc.save();
  }
}

export const contractService = new ContractService();
