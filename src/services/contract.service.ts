import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../errors/AppError.js';
import { addToContractQueue } from '../queues/contract.queue.js';
import { ContractProvider, DadosContrato, SignatureMetadata } from '../types/contract.js';
import { CreateContractDTO, ListContractsDTO } from '../types/dtos/contract.dto.js';
import { AtividadeAcao, AtividadeEntidadeTipo, ContractMultaTipo, ContratoProvider, ContratoStatus, PassageiroModalidade, PeriodoEnum } from '../types/enums.js';
import { getNowBR, toLocalDateString, parseLocalDate, addMonths } from '../utils/date.utils.js';
import { formatAddress } from '../utils/format.js';
import { historicoService } from './historico.service.js';
import { InHouseContractProvider } from './providers/inhouse-contract.provider.js';
import { notificationService } from './notifications/notification.service.js';
import { EVENTO_MOTORISTA_CONTRATO_ASSINADO, EVENTO_PASSAGEIRO_CONTRATO_ASSINADO } from '../config/constants.js';

import { contractRepository } from '../repositories/contract.repository.js';
import { passageiroRepository } from '../repositories/passageiro.repository.js';
import { userRepository } from '../repositories/user.repository.js';

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
    const { data: usuario, error } = await userRepository.getById(authId);

    if (error || !usuario) {
      logger.error({ authId, error }, 'Usuário não encontrado');
      throw new AppError('Usuário não encontrado', 404);
    }
    return usuario;
  }

  async criarContrato(authId: string, data: CreateContractDTO) {
    const { passageiroId, provider: providerName = ContratoProvider.INHOUSE, ...customTerms } = data;

    // 1. Resolver usuário (condutor)
    const usuario = await this.getUsuarioByAuthId(authId);
    const usuarioId = usuario.id;

    if (!usuario.config_contrato?.usar_contratos) {
      throw new AppError("A funcionalidade de contratos não está ativa para este usuário.", 400);
    }

    logger.info({ usuarioId: usuario.id, passageiroId, providerName }, 'Criando contrato');

    // 2. Buscar dados completos do passageiro no repositório
    const passageiro = await passageiroRepository.getByIdCompleto(passageiroId, usuarioId).catch((passageiroError) => {
      logger.error({ passageiroError }, 'Passageiro não encontrado');
      throw new AppError('Passageiro não encontrado', 404);
    });

    // 3. Cálculos dinâmicos
    const hoje = getNowBR();
    const dataInicio = customTerms.dataInicio || passageiro.data_inicio_transporte || toLocalDateString(hoje);

    const qtdParcelas = customTerms.qtdParcelas || 12;
    const valorMensal = customTerms.valorMensal || Number(passageiro.valor_cobranca);
    const valorTotal = valorMensal * qtdParcelas;

    const dInicio = parseLocalDate(dataInicio);
    const dFimCalculado = addMonths(dInicio, qtdParcelas);
    dFimCalculado.setDate(0); 
    const dataFim = customTerms.dataFim || toLocalDateString(dFimCalculado);

    // 4. Preparar dados do contrato
    const dadosContrato: DadosContrato = {
      nomePassageiro: passageiro.nome,
      nomeResponsavel: passageiro.nome_responsavel,
      cpfResponsavel: passageiro.cpf_responsavel,
      telefoneResponsavel: passageiro.telefone_responsavel,
      emailResponsavel: passageiro.email_responsavel,
      parentescoResponsavel: passageiro.parentesco_responsavel,
      enderecoCompleto: formatAddress(passageiro),
      nomeEscola: passageiro.escola?.nome || '',
      enderecoEscola: passageiro.escola ? formatAddress(passageiro.escola) : '',
      periodo: passageiro.periodo,
      modalidade: customTerms.modalidade || passageiro.modalidade || '',
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
      placaVeiculo: passageiro.veiculo?.placa || '',
      modeloVeiculo: passageiro.veiculo ? `${passageiro.veiculo.marca} ${passageiro.veiculo.modelo}` : '',
      clausulas: usuario.config_contrato?.clausulas,
      assinaturaCondutorUrl: usuario.assinatura_digital_url,
      apelidoCondutor: usuario.apelido,
    };

    // 5. Gerar token único e criar registro no banco via Repositorio
    const tokenAcesso = uuidv4();

    const contrato = await contractRepository.insert({
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
    });

    // 6. Enfileirar para Geração de PDF e Notificações (Assíncrono via BullMQ)
    await addToContractQueue({
      contratoId: contrato.id,
      usuarioId: usuarioId,
      providerName: providerName,
      dadosContrato,
      passageiro: {
        id: passageiro.id,
        nome: passageiro.nome,
        nome_responsavel: passageiro.nome_responsavel,
        telefone_responsavel: passageiro.telefone_responsavel
      },
      tokenAcesso
    });

    logger.info({ contratoId: contrato.id }, 'Fomento de contrato enfileirado com sucesso');

    // --- LOG DE AUDITORIA ---
    historicoService.log({
      usuario_id: usuarioId,
      entidade_tipo: AtividadeEntidadeTipo.PASSAGEIRO,
      entidade_id: passageiroId,
      acao: AtividadeAcao.CONTRATO_GERADO,
      descricao: `Novo contrato gerado para ${passageiro.nome}.`,
      meta: { contrato_id: contrato.id, valor_mensal: valorMensal }
    });

    const linkAssinatura = providerName === ContratoProvider.INHOUSE
      ? `${env.FRONTEND_URL}/assinar/${tokenAcesso}`
      : undefined; 

    return {
      ...contrato,
      linkAssinatura,
      minuta_url: null,
      contrato_url: null
    };
  }

  async processarAssinatura(tokenAcesso: string, assinaturaBase64: string, metadados: SignatureMetadata) {
    logger.info({ tokenAcesso }, 'Processando assinatura');

    // 1. Buscar contrato
    let contrato;
    try {
      contrato = await contractRepository.getByToken(tokenAcesso);
    } catch (error) {
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
    await contractRepository.updateStatus(contrato.id, {
      status: ContratoStatus.ASSINADO,
      contrato_final_url: response.documentoFinalUrl,
      assinado_em: response.assinadoEm,
      assinatura_metadados: metadados,
    });

    logger.info({ contratoId: contrato.id }, 'Contrato assinado com sucesso');

    // 4. Notificações
    const { usuario, passageiro } = contrato;

    // --- LOG DE AUDITORIA ---
    historicoService.log({
      usuario_id: usuario.id,
      entidade_tipo: AtividadeEntidadeTipo.PASSAGEIRO,
      entidade_id: passageiro.id,
      acao: AtividadeAcao.CONTRATO_ASSINADO,
      descricao: `Contrato de ${passageiro.nome} foi assinado digitalmente pelo responsável.`,
      meta: { contrato_id: contrato.id, documento_final: response.documentoFinalUrl }
    });

    if (passageiro.telefone_responsavel) {
      notificationService.notifyPassenger(
        passageiro.telefone_responsavel,
        EVENTO_PASSAGEIRO_CONTRATO_ASSINADO,
        {
          nomeResponsavel: passageiro.nome_responsavel,
          nomePassageiro: passageiro.nome,
          nomeMotorista: usuario.nome,
          contratoUrl: response.documentoFinalUrl,
          usuarioId: usuario.id
        }
      ).catch(err => logger.error({ err }, 'Erro ao notificar responsável sobre assinatura'));
    }

    if (usuario.telefone) {
      notificationService.notifyDriver(
        usuario.telefone,
        EVENTO_MOTORISTA_CONTRATO_ASSINADO,
        {
          nomeMotorista: usuario.nome,
          nomePassageiro: passageiro.nome,
          nomeResponsavel: passageiro.nome_responsavel,
          contratoUrl: response.documentoFinalUrl
        }
      ).catch(err => logger.error({ err }, 'Erro ao notificar motorista sobre assinatura'));
    }

    return {
      ...response,
      contrato_url: response.documentoFinalUrl
    };
  }

  async consultarContrato(tokenAcesso: string) {
    try {
      return await contractRepository.getByToken(tokenAcesso);
    } catch(err) {
      throw new AppError('Contrato não encontrado', 404);
    }
  }

  async listarContratos(authId: string, filters: ListContractsDTO & { tab?: string; search?: string }) {
    const usuario = await this.getUsuarioByAuthId(authId);
    const usuarioId = usuario.id;

    const { tab = 'pendentes', search, page = 1, limit = 20 } = filters;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    if (tab === 'sem_contrato') {
      const idsIgnorar = await contractRepository.getPassageirosIdsComContratoValido(usuarioId);
      let query = contractRepository.buildSemContratoQuery(usuarioId, idsIgnorar);

      if (search) {
        query = query.or(`nome.ilike.%${search}%,nome_responsavel.ilike.%${search}%`);
      }

      const { data, error, count } = await query.range(from, to).order('nome');

      if (error) throw error;

      return {
        data: data.map((p: Record<string, any>) => ({
          id: p.id,
          tipo: 'passageiro',
          passageiro: {
            nome: p.nome,
            nome_responsavel: p.nome_responsavel,
            telefone_responsavel: p.telefone_responsavel,
            ativo: p.ativo
          },
          dados_contrato: {
            valorMensal: Number(p.valor_cobranca),
            diaVencimento: p.dia_vencimento
          }
        })),
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      };
    }

    let statusQuery;
    if (tab === 'pendentes') statusQuery = ContratoStatus.PENDENTE;
    if (tab === 'assinados') statusQuery = ContratoStatus.ASSINADO;

    let query = contractRepository.buildListContratosQuery(usuarioId, statusQuery);

    if (search) {
      query = query.or(`nome.ilike.%${search}%,nome_responsavel.ilike.%${search}%`, { foreignTable: 'passageiro' });
    }

    const { data, error, count } = await query.range(from, to);

    if (error) throw error;

    return {
      data: data.map((c: Record<string, any>) => ({ ...c, tipo: 'contrato' })),
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  async getKPIs(authId: string) {
    const usuario = await this.getUsuarioByAuthId(authId);
    const usuarioId = usuario.id;

    const { pendentes, assinados } = await contractRepository.getKPIs(usuarioId);
    const semContrato = await contractRepository.getSemContratoCount(usuarioId);

    return {
      pendentes,
      assinados,
      semContrato
    };
  }

  async substituirContrato(authId: string, contratoId: string) {
    const usuario = await this.getUsuarioByAuthId(authId);

    let contratoOriginal;
    try {
      contratoOriginal = await contractRepository.getById(contratoId, usuario.id);
    } catch(err) {
      throw new AppError('Contrato não encontrado', 404);
    }

    await contractRepository.aposentarContratosPassageiro(contratoOriginal.passageiro_id);

    return this.criarContrato(authId, {
      passageiroId: contratoOriginal.passageiro_id,
      provider: contratoOriginal.provider as ContratoProvider
    });
  }

  async excluirContrato(contratoId: string, authId: string) {
    const usuario = await this.getUsuarioByAuthId(authId);
    const usuarioId = usuario.id;

    let contrato;
    try {
      contrato = await contractRepository.getById(contratoId, usuarioId);
    } catch(err) {
      throw new AppError('Contrato não encontrado', 404);
    }

    await contractRepository.delete(contratoId, usuarioId);

    logger.info({ contratoId }, 'Contrato excluído');

    // --- LOG DE AUDITORIA ---
    if (contrato) {
      historicoService.log({
        usuario_id: usuarioId,
        entidade_tipo: AtividadeEntidadeTipo.PASSAGEIRO,
        entidade_id: contrato.passageiro_id,
        acao: AtividadeAcao.CONTRATO_EXCLUIDO,
        descricao: `Contrato foi excluído pelo motorista.`,
        meta: { contrato_id: contratoId }
      });
    }

    return { success: true };
  }

  async reenviarNotificacao(authId: string, contratoId: string) {
    const usuario = await this.getUsuarioByAuthId(authId);

    let contrato;
    try {
      contrato = await contractRepository.getById(contratoId, usuario.id);
    } catch (error) {
      throw new AppError('Contrato não encontrado', 404);
    }
    
    if (contrato.status !== ContratoStatus.PENDENTE) throw new AppError('Apenas contratos pendentes podem ser reenviados', 400);

    const passageiro = contrato.passageiro;

    if (!passageiro.telefone_responsavel) throw new AppError('Passageiro sem telefone do responsável', 400);

    // Enfileirar novamente
    await addToContractQueue({
      contratoId: contrato.id,
      usuarioId: usuario.id,
      providerName: contrato.provider as ContratoProvider,
      dadosContrato: contrato.dados_contrato,
      passageiro: {
        id: passageiro.id,
        nome: passageiro.nome,
        nome_responsavel: passageiro.nome_responsavel,
        telefone_responsavel: passageiro.telefone_responsavel
      },
      tokenAcesso: contrato.token_acesso
    });

    return { success: true };
  }

  async baixarContrato(contratoId: string, authId: string) {
    const usuario = await this.getUsuarioByAuthId(authId);
    const usuarioId = usuario.id;

    let contrato;
    try {
      contrato = await contractRepository.getById(contratoId, usuarioId);
    } catch (err) {
      throw new AppError('Contrato não encontrado', 404);
    }

    const provider = this.getProvider(contrato.provider);
    return provider.baixarDocumento(contratoId);
  }

  async gerarPreview(authId: string, draftConfig?: Partial<DadosContrato>) {
    let usuario;
    try {
      const resp = await userRepository.getById(authId);
      usuario = resp.data;
    } catch(err) {
      throw new AppError('Usuário não encontrado', 404);
    }

    if (!usuario) {
      throw new AppError('Usuário não encontrado', 404);
    }

    const hoje = getNowBR();
    const anoVigente = hoje.getFullYear();

    const config = draftConfig || {};
    const savedConfig = usuario.config_contrato || {};

    const multaAtraso = config.multaAtraso || savedConfig.multa_atraso || { valor: 10, tipo: ContractMultaTipo.PERCENTUAL };
    const multaRescisao = config.multaRescisao || savedConfig.multa_rescisao || { valor: 15, tipo: ContractMultaTipo.PERCENTUAL };
    const clausulas = config.clausulas || savedConfig.clausulas || [
      "O serviço contratado consiste no transporte do passageiro acima citado, no trajeto com origem e destino acordado entre as partes.",
      "Somente o passageiro CONTRATANTE está autorizado a utilizar-se do objeto deste contrato, sendo vedado o passageiro se fazer acompanhar de colegas, parentes, amigos e etc."
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
      dataInicio: toLocalDateString(hoje),
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

      assinaturaCondutorUrl: config.assinaturaCondutorUrl || usuario.assinatura_digital_url,
      apelidoCondutor: usuario.apelido,
    };

    const provider = this.getProvider(ContratoProvider.INHOUSE) as InHouseContractProvider;
    const pdfDoc = await provider.criarPdfBase(dadosContrato);
    return pdfDoc.save();
  }
}

export const contractService = new ContractService();
