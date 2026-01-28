import { InHouseContractProvider } from './providers/inhouse-contract.provider.js';
import { ContractProvider, DadosContrato } from '../types/contract.js';
import { supabaseAdmin } from '../config/supabase.js';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../config/logger.js';

class ContractService {
  private providers: Map<string, ContractProvider> = new Map();

  constructor() {
    this.providers.set('inhouse', new InHouseContractProvider());
  }

  private getProvider(providerName: string): ContractProvider {
    const provider = this.providers.get(providerName);
    if (!provider) throw new Error(`Provider ${providerName} nao encontrado`);
    return provider;
  }

  async criarContrato(usuarioId: string, passageiroId: string, providerName: string = 'inhouse') {
    logger.info({ usuarioId, passageiroId, providerName }, 'Criando contrato');

    // 1. Buscar dados do passageiro
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
      logger.error({ passageiroError }, 'Passageiro nao encontrado');
      throw new Error('Passageiro nao encontrado');
    }
    
    // 2. Buscar dados do usuário (condutor)
    const { data: usuario, error: usuarioError } = await supabaseAdmin
      .from('usuarios')
      .select('*')
      .eq('id', usuarioId)
      .single();
    
    if (usuarioError || !usuario) {
      logger.error({ usuarioError }, 'Usuario nao encontrado');
      throw new Error('Usuario nao encontrado');
    }
    
    // 3. Preparar dados do contrato
    const dadosContrato: DadosContrato = {
      nomeAluno: passageiro.nome,
      nomeResponsavel: passageiro.nome_responsavel,
      cpfResponsavel: passageiro.cpf_responsavel,
      telefoneResponsavel: passageiro.telefone_responsavel,
      emailResponsavel: passageiro.email_responsavel,
      enderecoCompleto: `${passageiro.logradouro}, ${passageiro.numero} - ${passageiro.bairro}, ${passageiro.cidade}/${passageiro.estado}`,
      nomeEscola: passageiro.escola.nome,
      enderecoEscola: `${passageiro.escola.logradouro}, ${passageiro.escola.numero} - ${passageiro.escola.bairro}`,
      periodo: passageiro.periodo,
      modalidade: 'Ida e Volta',
      valorMensal: Number(passageiro.valor_cobranca),
      diaVencimento: passageiro.dia_vencimento,
      dataInicio: new Date().toISOString().split('T')[0],
      dataFim: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
      nomeCondutor: usuario.nome,
      cpfCnpjCondutor: usuario.cpfcnpj,
      telefoneCondutor: usuario.telefone,
      placaVeiculo: passageiro.veiculo.placa,
      modeloVeiculo: `${passageiro.veiculo.marca} ${passageiro.veiculo.modelo}`,
    };
    
    // 4. Gerar token único
    const tokenAcesso = uuidv4();
    
    // 5. Criar registro no banco
    const { data: contrato, error: contratoError } = await supabaseAdmin
      .from('contratos')
      .insert({
        usuario_id: usuarioId,
        passageiro_id: passageiroId,
        token_acesso: tokenAcesso,
        provider: providerName,
        dados_contrato: dadosContrato,
        status: 'pendente',
      })
      .select()
      .single();
    
    if (contratoError) {
      logger.error({ contratoError }, 'Erro ao criar contrato no banco');
      throw contratoError;
    }
    
    // 6. Gerar contrato usando provider
    const provider = this.getProvider(providerName);
    const response = await provider.gerarContrato({
      contratoId: contrato.id,
      dadosContrato,
    });
    
    // 7. Atualizar registro com URLs
    await supabaseAdmin
      .from('contratos')
      .update({
        minuta_url: response.documentUrl,
        provider_document_id: response.providerDocumentId,
        provider_link_assinatura: response.providerSignatureLink,
      })
      .eq('id', contrato.id);
    
    logger.info({ contratoId: contrato.id }, 'Contrato criado com sucesso');
    
    return {
      ...contrato,
      minuta_url: response.documentUrl,
      linkAssinatura: providerName === 'inhouse' 
        ? `${process.env.FRONTEND_URL}/assinar/${tokenAcesso}`
        : response.providerSignatureLink,
    };
  }

  async processarAssinatura(tokenAcesso: string, assinaturaBase64: string, metadados: any) {
    logger.info({ tokenAcesso }, 'Processando assinatura');

    // 1. Buscar contrato
    const { data: contrato, error } = await supabaseAdmin
      .from('contratos')
      .select('*')
      .eq('token_acesso', tokenAcesso)
      .single();
    
    if (error || !contrato) {
      logger.error({ error }, 'Contrato nao encontrado');
      throw new Error('Contrato nao encontrado');
    }
    
    if (contrato.status !== 'pendente') {
      throw new Error('Contrato ja foi assinado ou cancelado');
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
        status: 'assinado',
        contrato_final_url: response.documentoFinalUrl,
        assinado_em: response.assinadoEm,
        assinatura_metadados: metadados,
      })
      .eq('id', contrato.id);
    
    logger.info({ contratoId: contrato.id }, 'Contrato assinado com sucesso');
    
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

  async listarContratos(usuarioId: string, filters: any) {
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

  async cancelarContrato(contratoId: string, usuarioId: string) {
    const { data: contrato } = await supabaseAdmin
      .from('contratos')
      .select('provider')
      .eq('id', contratoId)
      .eq('usuario_id', usuarioId)
      .single();
    
    if (!contrato) throw new Error('Contrato nao encontrado');
    
    const provider = this.getProvider(contrato.provider);
    await provider.cancelarContrato(contratoId);
    
    logger.info({ contratoId }, 'Contrato cancelado');
    
    return { success: true };
  }

  async baixarContrato(contratoId: string, usuarioId: string) {
    const { data: contrato } = await supabaseAdmin
      .from('contratos')
      .select('provider')
      .eq('id', contratoId)
      .eq('usuario_id', usuarioId)
      .single();
    
    if (!contrato) throw new Error('Contrato nao encontrado');
    
    const provider = this.getProvider(contrato.provider);
    return provider.baixarDocumento(contratoId);
  }
}

export const contractService = new ContractService();
