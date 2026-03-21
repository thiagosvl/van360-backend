import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../errors/AppError.js';
import { addToContractQueue } from '../queues/contract.queue.js';
import { ContractProvider, DadosContrato, SignatureMetadata } from '../types/contract.js';
import { CreateContractDTO, ListContractsDTO } from '../types/dtos/contract.dto.js';
import { AtividadeAcao, AtividadeEntidadeTipo, ContractMultaTipo, ContratoProvider, ContratoStatus, PassageiroModalidade, PeriodoEnum } from '../types/enums.js';
import { toLocalDateString } from '../utils/date.utils.js';
import { formatAddress, getFirstName } from '../utils/format.js';
import { historicoService } from './historico.service.js';
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
      .eq('id', authId)
      .single();

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
    const dataInicio = customTerms.dataInicio || passageiro.data_inicio_transporte || toLocalDateString(hoje);

    // Período padrão de 12 meses (ou o que o usuário definir)
    const qtdParcelas = customTerms.qtdParcelas || 12;
    const valorMensal = customTerms.valorMensal || Number(passageiro.valor_cobranca);
    const valorTotal = valorMensal * qtdParcelas;

    // Calcular data fim baseada em data início + (qtdParcelas - 1) meses para terminar no final do ciclo
    const dInicio = new Date(dataInicio + 'T12:00:00');
    const dFim = new Date(dInicio);
    dFim.setMonth(dInicio.getMonth() + qtdParcelas);
    dFim.setDate(0); // Último dia do mês anterior ao mês do vencimento final
    const dataFim = customTerms.dataFim || toLocalDateString(dFim);

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
      assinaturaCondutorUrl: usuario.assinatura_digital_url,
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
      : undefined; // Será atualizado pelo worker se for externo

    return {
      ...contrato,
      linkAssinatura,
      minuta_url: null, // Ainda não gerada
      contrato_url: null
    };
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

    // --- LOG DE AUDITORIA ---
    historicoService.log({
      usuario_id: usuario.id,
      entidade_tipo: AtividadeEntidadeTipo.PASSAGEIRO,
      entidade_id: passageiro.id,
      acao: AtividadeAcao.CONTRATO_ASSINADO,
      descricao: `Contrato de ${passageiro.nome} foi assinado digitalmente pelo responsável.`,
      meta: { contrato_id: contrato.id, documento_final: response.documentoFinalUrl }
    });

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
        .catch(err => logger.error({ err }, 'Erro ao notify driver about signature'));
    }

    return {
      ...response,
      contrato_url: response.documentoFinalUrl
    };

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

  async listarContratos(authId: string, filters: ListContractsDTO & { tab?: string; search?: string }) {
    const usuario = await this.getUsuarioByAuthId(authId);
    const usuarioId = usuario.id;

    const { tab = 'pendentes', search, page = 1, limit = 20 } = filters;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    if (tab === 'sem_contrato') {
      // Buscar passageiros ativos que NÃO têm contrato pendente ou assinado
      // Usamos uma subquery ou um join negado
      let query = supabaseAdmin
        .from('passageiros')
        .select(`
          id, 
          nome,
          ativo, 
          nome_responsavel, 
          telefone_responsavel,
          valor_cobranca,
          dia_vencimento
        `, { count: 'exact' })
        .eq('usuario_id', usuarioId);

      if (search) {
        query = query.or(`nome.ilike.%${search}%,nome_responsavel.ilike.%${search}%`);
      }

      // Filtro para excluir quem já tem contrato "válido"
      // Nota: No Supabase/PostgREST, fazer um "not in subquery" é complexo via query builder direto.
      // Vamos buscar os IDs de quem TEM contrato válido primeiro (geralmente poucos passageiros por motorista)
      const { data: comContrato } = await supabaseAdmin
        .from('contratos')
        .select('passageiro_id')
        .eq('usuario_id', usuarioId)
        .in('status', [ContratoStatus.PENDENTE, ContratoStatus.ASSINADO]);

      const idsIgnorar = (comContrato?.map(c => c.passageiro_id) || []);

      if (idsIgnorar.length > 0) {
        query = query.not('id', 'in', `(${idsIgnorar.join(',')})`);
      }

      const { data, error, count } = await query.range(from, to).order('nome');

      if (error) throw error;

      return {
        data: data.map(p => ({
          id: p.id,
          tipo: 'passageiro',
          passageiro: {
            nome: p.nome,
            nome_responsavel: p.nome_responsavel,
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

    // Listagem de Contratos Reais (Pendentes ou Assinados)
    let query = supabaseAdmin
      .from('contratos')
      .select('*, passageiro:passageiros!inner(nome, nome_responsavel, ativo)', { count: 'exact' })
      .eq('usuario_id', usuarioId)
      .order('created_at', { ascending: false });

    if (tab === 'pendentes') {
      query = query.eq('status', ContratoStatus.PENDENTE);
    } else if (tab === 'assinados') {
      query = query.eq('status', ContratoStatus.ASSINADO);
    }

    if (search) {
      query = query.or(`nome.ilike.%${search}%,nome_responsavel.ilike.%${search}%`, { foreignTable: 'passageiro' });
    }

    const { data, error, count } = await query.range(from, to);

    if (error) throw error;

    return {
      data: data.map(c => ({ ...c, tipo: 'contrato' })),
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

    // 1. Contratos Pendentes
    const { count: pendentes } = await supabaseAdmin
      .from('contratos')
      .select('*', { count: 'exact', head: true })
      .eq('usuario_id', usuarioId)
      .eq('status', ContratoStatus.PENDENTE);

    // 2. Contratos Assinados
    const { count: assinados } = await supabaseAdmin
      .from('contratos')
      .select('*', { count: 'exact', head: true })
      .eq('usuario_id', usuarioId)
      .eq('status', ContratoStatus.ASSINADO);

    // 3. Sem Contrato (Passageiros Ativos sem contrato válido)
    // Primeiro pegamos os passageiros que TEM contrato válido
    const { data: comContrato } = await supabaseAdmin
      .from('contratos')
      .select('passageiro_id')
      .eq('usuario_id', usuarioId)
      .in('status', [ContratoStatus.PENDENTE, ContratoStatus.ASSINADO]);

    const idsIgnorar = (comContrato?.map(c => c.passageiro_id) || []);

    let querySemContrato = supabaseAdmin
      .from('passageiros')
      .select('*', { count: 'exact', head: true })
      .eq('usuario_id', usuarioId);

    if (idsIgnorar.length > 0) {
      querySemContrato = querySemContrato.not('id', 'in', `(${idsIgnorar.join(',')})`);
    }

    const { count: semContrato } = await querySemContrato;

    return {
      pendentes: pendentes || 0,
      assinados: assinados || 0,
      semContrato: semContrato || 0
    };
  }

  async substituirContrato(authId: string, contratoId: string) {
    const usuario = await this.getUsuarioByAuthId(authId);

    // 1. Buscar contrato atual
    const { data: contratoOriginal } = await supabaseAdmin
      .from('contratos')
      .select('*')
      .eq('id', contratoId)
      .eq('usuario_id', usuario.id)
      .single();

    if (!contratoOriginal) throw new AppError('Contrato não encontrado', 404);

    // 2. Aposentar todos os contratos ativos do passageiro
    await supabaseAdmin
      .from('contratos')
      .update({ status: ContratoStatus.SUBSTITUIDO })
      .eq('passageiro_id', contratoOriginal.passageiro_id)
      .in('status', [ContratoStatus.PENDENTE, ContratoStatus.ASSINADO]);

    // 3. Criar novo contrato baseado nos dados atuais do passageiro
    return this.criarContrato(authId, {
      passageiroId: contratoOriginal.passageiro_id,
      provider: contratoOriginal.provider as ContratoProvider
    });
  }

  async excluirContrato(contratoId: string, authId: string) {
    const usuario = await this.getUsuarioByAuthId(authId);
    const usuarioId = usuario.id;

    // 1. Buscar dados do passageiro antes de excluir para auditoria
    const { data: contrato } = await supabaseAdmin
      .from('contratos')
      .select('passageiro_id')
      .eq('id', contratoId)
      .eq('usuario_id', usuarioId)
      .single();

    const { error } = await supabaseAdmin
      .from('contratos')
      .delete()
      .eq('id', contratoId)
      .eq('usuario_id', usuarioId);

    if (error) throw error;

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

    const { data: contrato, error } = await supabaseAdmin
      .from('contratos')
      .select('*, passageiro:passageiros(*)')
      .eq('id', contratoId)
      .eq('usuario_id', usuario.id)
      .single();

    if (error || !contrato) throw new AppError('Contrato não encontrado', 404);
    if (contrato.status !== ContratoStatus.PENDENTE) throw new AppError('Apenas contratos pendentes podem ser reenviados', 400);

    const { passageiro } = contrato as any;

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
    // 1. Buscar dados do usuário (condutor)
    const { data: usuario, error: usuarioError } = await supabaseAdmin
      .from('usuarios')
      .select('*')
      .eq('id', authId)
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

    // 3. Gerar PDF temporário usando o provider InHouse
    const provider = this.getProvider(ContratoProvider.INHOUSE) as InHouseContractProvider;
    const pdfDoc = await provider.criarPdfBase(dadosContrato);
    return pdfDoc.save();
  }
}

export const contractService = new ContractService();
