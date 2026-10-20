import crypto from "node:crypto";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { EVENTO_MOTORISTA_RENOVACAO_RESPOSTA_RECEBIDA } from "../config/constants.js";
import { renovacaoRepository, type PassageiroComRenovacaoItem } from "../repositories/renovacao.repository.js";
import { passageiroRepository } from "../repositories/passageiro.repository.js";
import { contractRepository } from "../repositories/contract.repository.js";
import { historicoRepository } from "../repositories/historico.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { escolaRepository } from "../repositories/escola.repository.js";
import { AppError } from "../errors/AppError.js";
import {
  ListRenovacoesQueryDTO,
  ReajusteLoteDTO,
  UpdateRenovacaoDTO,
  AtualizarStatusLoteDTO,
  AtualizarDadosPublicosDTO,
  SalvarRenovacaoContratoConfigDTO,
  SalvarPeriodoRenovacaoConfigDTO,
} from "../types/dtos/renovacao.dto.js";
import {
  NotificationChannelEnum,
  RenovacaoReajusteTipo,
  RenovacaoStatus,
  TipoResponsavel,
  ContratoProvider,
  ContratoStatus,
  CobrancaStatus,
  ModoCobrancaEnum,
} from "../types/enums.js";
import { toPersistenceString } from "../utils/date.utils.js";
import { cleanString, normalizePhone, onlyDigits } from "../utils/string.utils.js";
import { notificationService } from "./notifications/notification.service.js";
import { resolveContractConfigForYear } from "./contract.service.js";
import { cobrancaValidacaoService } from "./cobranca-validacao.service.js";

type EnrichedPassageiro = PassageiroComRenovacaoItem["passageiro"] & {
  responsavel_principal: {
    id: string;
    nome: string | null;
    telefone: string | null;
    cpf: string | null;
    email: string | null;
    parentesco: string | null;
    cep?: string | null;
    logradouro?: string | null;
    numero?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    estado?: string | null;
    complemento?: string | null;
    referencia?: string | null;
  } | null;
};

interface PeriodoMestreAnoConfig {
  mes_inicio_cobranca?: number | null;
  ano_inicio_cobranca?: number | null;
  mes_fim_cobranca?: number | null;
  ano_fim_cobranca?: number | null;
  data_inicio_transporte?: string | null;
  data_fim_transporte?: string | null;
  configurado_em?: string | null;
}

interface ConfigRenovacaoStorage {
  anos?: Record<string, PeriodoMestreAnoConfig>;
}

const _formatMesAnoParaDataISO = (ano?: number | null, mes?: number | null): string | null => {
  if (!ano || !mes) return null;
  return `${ano}-${String(mes).padStart(2, "0")}-01`;
};

const _enrichPassageiroResponsavel = (p: PassageiroComRenovacaoItem["passageiro"]): EnrichedPassageiro => {
  const links = p.responsaveis || [];
  const principalLink = links.find((l) => l.tipo === TipoResponsavel.PRINCIPAL) || links[0];
  const rawResp = principalLink?.responsavel;
  const resp = Array.isArray(rawResp) ? rawResp[0] : rawResp;

  return {
    ...p,
    responsavel_principal: principalLink && resp ? {
      id: resp.id,
      nome: resp.nome || null,
      telefone: resp.telefone || null,
      cpf: resp.cpf || null,
      email: resp.email || null,
      parentesco: principalLink.parentesco || null,
      cep: resp.cep || null,
      logradouro: resp.logradouro || null,
      numero: resp.numero || null,
      bairro: resp.bairro || null,
      cidade: resp.cidade || null,
      estado: resp.estado || null,
      complemento: resp.complemento || null,
      referencia: resp.referencia || null,
    } : null,
  };
};

function projectDateToYear(dateStr: string | null | undefined, targetYear: number, sourceYear?: number): string | null {
  if (!dateStr) return null;
  const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, yStr, m, dStr] = match;
    const origYear = Number(yStr);
    const baseSourceYear = sourceYear || (targetYear - 1);
    const deltaYears = targetYear - baseSourceYear;
    const newYear = origYear + (deltaYears > 0 ? deltaYears : 1);
    let d = dStr;
    if (m === "02" && d === "29") {
      const isLeap = (newYear % 4 === 0 && newYear % 100 !== 0) || (newYear % 400 === 0);
      if (!isLeap) d = "28";
    }
    return `${newYear}-${m}-${d}`;
  }
  return null;
}

const _resolverDatasTransporteParaContrato = (
  reservaDtInicio: string | null | undefined,
  reservaDtFim: string | null | undefined,
  periodoConfig: PeriodoMestreAnoConfig | null | undefined,
  _anoDestino: number
): { dataInicio?: string; dataFim?: string } => {
  const dataInicio = reservaDtInicio
    ? String(reservaDtInicio)
    : (periodoConfig?.data_inicio_transporte
      ? String(periodoConfig.data_inicio_transporte)
      : undefined);

  const dataFim = reservaDtFim
    ? String(reservaDtFim)
    : (periodoConfig?.data_fim_transporte
      ? String(periodoConfig.data_fim_transporte)
      : undefined);

  return { dataInicio, dataFim };
};

const _sincronizarMatriculaConfirmada = async (
  usuarioId: string,
  passageiroOrigem: Record<string, any>,
  reserva: Record<string, any>,
  anoDestino: number
) => {
  const anoOrigem = Number(reserva.ano_origem || passageiroOrigem.ano_letivo || (anoDestino - 1));
  const isento = Boolean(reserva.novo_isento ?? passageiroOrigem.isento);

  let dtInicioTransp = reserva.nova_data_inicio_transporte
    ? String(reserva.nova_data_inicio_transporte)
    : null;
  let dtFimTransp = reserva.nova_data_fim_transporte
    ? String(reserva.nova_data_fim_transporte)
    : null;

  let dtInicioCobr = isento
    ? null
    : (reserva.nova_data_inicio_cobranca
      ? String(reserva.nova_data_inicio_cobranca)
      : null);
  let dtFimCobr = isento
    ? null
    : (reserva.nova_data_fim_cobranca
      ? String(reserva.nova_data_fim_cobranca)
      : null);

  if (!isento && (!dtInicioCobr || !dtFimCobr || !dtInicioTransp || !dtFimTransp)) {
    const { userRepository } = await import("../repositories/user.repository.js");
    const { data: usuario } = await userRepository.getProfileData(usuarioId);
    const configRenovacao = (usuario?.config_renovacao as ConfigRenovacaoStorage | null) || {};
    const masterConfig = configRenovacao.anos?.[String(anoDestino)];

    if (masterConfig) {
      if (!dtInicioCobr) {
        dtInicioCobr = _formatMesAnoParaDataISO(masterConfig.ano_inicio_cobranca, masterConfig.mes_inicio_cobranca);
      }
      if (!dtFimCobr) {
        dtFimCobr = _formatMesAnoParaDataISO(masterConfig.ano_fim_cobranca, masterConfig.mes_fim_cobranca);
      }
      if (!dtInicioTransp && masterConfig.data_inicio_transporte) {
        dtInicioTransp = String(masterConfig.data_inicio_transporte);
      }
      if (!dtFimTransp && masterConfig.data_fim_transporte) {
        dtFimTransp = String(masterConfig.data_fim_transporte);
      }
    }
  }

  if (!isento && (!dtInicioCobr || !dtFimCobr)) {
    throw new AppError(
      `O período de cobrança de ${anoDestino} não foi configurado. Configure o período de cobrança antes de confirmar vagas.`,
      400
    );
  }

  const matriculaPayload: Record<string, unknown> = {
    usuario_id: usuarioId,
    passageiro_id: passageiroOrigem.id,
    ano_letivo: anoDestino,
    ativo: true,
    escola_id: reserva.nova_escola_id ?? passageiroOrigem.escola_id,
    veiculo_id: reserva.novo_veiculo_id ?? passageiroOrigem.veiculo_id,
    periodo: reserva.novo_periodo ?? passageiroOrigem.periodo,
    modalidade: reserva.nova_modalidade ?? passageiroOrigem.modalidade,
    turma: reserva.nova_turma ?? null,
    sala: reserva.nova_sala ?? null,
    nome_professor: reserva.novo_nome_professor ?? null,
    horario_entrada: passageiroOrigem.horario_entrada ?? null,
    horario_saida: passageiroOrigem.horario_saida ?? null,
    isento,
    valor_cobranca: isento ? null : Number(reserva.novo_valor_cobranca ?? passageiroOrigem.valor_cobranca ?? 0),
    dia_vencimento: isento ? null : Number(reserva.novo_dia_vencimento ?? passageiroOrigem.dia_vencimento ?? 10),
    modo_cobranca: isento ? ModoCobrancaEnum.DESATIVADO : (passageiroOrigem.modo_cobranca ?? null),
    data_inicio_transporte: dtInicioTransp,
    data_fim_transporte: dtFimTransp,
    data_inicio_cobranca: dtInicioCobr,
    data_fim_cobranca: dtFimCobr,
  };

  const { error } = await passageiroRepository.upsertMatricula(matriculaPayload);
  if (error) throw error;
};

const _validarSemParcelasPagasNoAnoDestino = async (passageiroId: string, anoDestino: number, nomePassageiro?: string) => {
  const countPagas = await renovacaoRepository.countCobrancasPagasAnoDestino(passageiroId, anoDestino);
  if (countPagas > 0) {
    throw new AppError(
      `Não é possível reverter a confirmação de ${nomePassageiro || "este aluno"} para ${anoDestino} pois já existem parcelas pagas registradas em ${anoDestino}.`,
      400
    );
  }
};

const _removerMatriculaAnoDestinoSePermitido = async (
  passageiroId: string,
  anoDestino: number,
  nomePassageiro?: string,
  allowCancelSignedContract: boolean = false
) => {
  await _validarSemParcelasPagasNoAnoDestino(passageiroId, anoDestino, nomePassageiro);

  const cobrancasPendentes = await renovacaoRepository.listCobrancasPendentesAnoDestino(passageiroId, anoDestino);

  if (cobrancasPendentes && cobrancasPendentes.length > 0) {
    for (const cob of cobrancasPendentes) {
      if (cob.provedor_cobranca_id) {
        void cobrancaValidacaoService.cancelarPixCobrancaSeExistir(cob.id, cob.provedor_cobranca_id);
      }
    }
    await renovacaoRepository.cancelarCobrancasPendentes(cobrancasPendentes.map((c) => c.id));
  }

  try {
    await contractRepository.aposentarContratosPassageiro(passageiroId, !allowCancelSignedContract, anoDestino);
  } catch (err: unknown) {
    logger.warn({ error: err, passageiroId, anoDestino }, "[Renovacao] Falha ao aposentar contrato ao remover matrícula do ano destino");
  }

  const { error } = await passageiroRepository.deleteMatricula(passageiroId, anoDestino);
  if (error) throw error;
};

export const renovacaoService = {
  async getContratoConfig(usuarioId: string, ano: number) {
    const { userRepository } = await import("../repositories/user.repository.js");
    const { data: usuario } = await userRepository.getProfileData(usuarioId);
    if (!usuario) {
      throw new AppError("Usuário não encontrado.", 404);
    }

    const resolved = resolveContractConfigForYear(usuario.config_contrato as Record<string, any>, ano);

    const baseConfig = (usuario.config_contrato as Record<string, any>) || {};
    const anos = (baseConfig.anos as Record<string, any>) || {};
    const anoConfig = anos[String(ano)] || anos[ano];

    return {
      ano,
      customizado_para_ano: Boolean(anoConfig),
      usar_contratos: resolved.usar_contratos,
      multa_atraso: resolved.multa_atraso,
      juros_atraso: resolved.juros_atraso,
      multa_rescisao: resolved.multa_rescisao,
      secoes: resolved.secoes,
      clausulas: resolved.clausulas,
      tem_assinatura_digital: Boolean(usuario.assinatura_digital_url),
      logo_url: usuario.logo_url,
    };
  },

  async salvarContratoConfig(usuarioId: string, dto: SalvarRenovacaoContratoConfigDTO) {
    const { userRepository } = await import("../repositories/user.repository.js");
    const { data: usuario } = await userRepository.getProfileData(usuarioId);
    if (!usuario) {
      throw new AppError("Usuário não encontrado.", 404);
    }

    const baseConfig = (usuario.config_contrato as Record<string, any>) || {};
    const anos = { ...(baseConfig.anos as Record<string, any> || {}) };

    anos[String(dto.ano)] = {
      usar_contratos: dto.usar_contratos,
      multa_atraso: dto.multa_atraso || null,
      juros_atraso: dto.juros_atraso || null,
      multa_rescisao: dto.multa_rescisao || null,
      secoes: dto.secoes || null,
      clausulas: dto.clausulas || null,
    };

    const newConfigContrato = {
      ...baseConfig,
      anos,
    };

    await userRepository.updateContractConfig(usuarioId, newConfigContrato);

    return this.getContratoConfig(usuarioId, dto.ano);
  },

  async getPeriodoRenovacaoConfig(usuarioId: string, ano: number) {
    const { data: usuario } = await userRepository.getProfileData(usuarioId);
    if (!usuario) {
      throw new AppError("Usuário não encontrado.", 404);
    }

    const baseConfig = (usuario.config_renovacao as ConfigRenovacaoStorage | null) || {};
    const anoConfig = baseConfig.anos?.[String(ano)];

    if (!anoConfig || !anoConfig.mes_inicio_cobranca || !anoConfig.ano_inicio_cobranca || !anoConfig.mes_fim_cobranca || !anoConfig.ano_fim_cobranca) {
      return {
        configurado: false,
        ano,
        mes_inicio_cobranca: null,
        ano_inicio_cobranca: null,
        mes_fim_cobranca: null,
        ano_fim_cobranca: null,
        data_inicio_transporte: null,
        data_fim_transporte: null,
        configurado_em: null,
      };
    }

    return {
      configurado: true,
      ano,
      mes_inicio_cobranca: Number(anoConfig.mes_inicio_cobranca),
      ano_inicio_cobranca: Number(anoConfig.ano_inicio_cobranca),
      mes_fim_cobranca: Number(anoConfig.mes_fim_cobranca),
      ano_fim_cobranca: Number(anoConfig.ano_fim_cobranca),
      data_inicio_transporte: anoConfig.data_inicio_transporte ? String(anoConfig.data_inicio_transporte) : null,
      data_fim_transporte: anoConfig.data_fim_transporte ? String(anoConfig.data_fim_transporte) : null,
      configurado_em: anoConfig.configurado_em ? String(anoConfig.configurado_em) : null,
    };
  },

  async salvarPeriodoRenovacaoConfig(usuarioId: string, dto: SalvarPeriodoRenovacaoConfigDTO) {
    const { data: usuario } = await userRepository.getProfileData(usuarioId);
    if (!usuario) {
      throw new AppError("Usuário não encontrado.", 404);
    }

    const baseConfig = (usuario.config_renovacao as ConfigRenovacaoStorage | null) || {};
    const anos: Record<string, PeriodoMestreAnoConfig> = { ...(baseConfig.anos || {}) };

    anos[String(dto.ano)] = {
      mes_inicio_cobranca: dto.mes_inicio_cobranca,
      ano_inicio_cobranca: dto.ano_inicio_cobranca,
      mes_fim_cobranca: dto.mes_fim_cobranca,
      ano_fim_cobranca: dto.ano_fim_cobranca,
      data_inicio_transporte: dto.data_inicio_transporte || null,
      data_fim_transporte: dto.data_fim_transporte || null,
      configurado_em: new Date().toISOString(),
    };

    const newConfigRenovacao = {
      ...baseConfig,
      anos,
    };

    await userRepository.updateRenovacaoConfig(usuarioId, newConfigRenovacao);

    return this.getPeriodoRenovacaoConfig(usuarioId, dto.ano);
  },

  async getDashboardRenovacao(usuarioId: string, query: ListRenovacoesQueryDTO) {
    const anoDestino = query.ano_destino || 2027;
    const anoOrigem = anoDestino - 1;
    const periodoConfig = await this.getPeriodoRenovacaoConfig(usuarioId, anoDestino);
    const itens = await renovacaoRepository.listPassageirosComRenovacao(usuarioId, anoDestino);

    const contratosDoAno = await contractRepository.listBasicByAno(usuarioId, anoDestino, [
      ContratoStatus.PENDENTE,
      ContratoStatus.ASSINADO,
    ]);

    const contratosMap = new Map<string, { id: string; status: string }>();
    if (contratosDoAno) {
      for (const c of contratosDoAno) {
        contratosMap.set(c.passageiro_id, { id: c.id, status: c.status });
      }
    }

    let faturamentoAtual = 0;
    let faturamentoProjetado = 0;
    let countAtivos = 0;
    let countConfirmados = 0;
    let countPendentes = 0;
    let countNaoNotificados = 0;
    let countSaidas = 0;

    const listConsolidada = itens.map(({ passageiro, renovacao }) => {
      const pEnriched = _enrichPassageiroResponsavel(passageiro);
      countAtivos++;

      const valorAtual = pEnriched.isento ? 0 : Number(pEnriched.valor_cobranca || 0);
      faturamentoAtual += valorAtual;

      let statusReserva: string;
      let novoValor = valorAtual;
      let novoVencimento = pEnriched.dia_vencimento;
      let novaEscolaId = pEnriched.escola_id;
      let novaEscolaNome = pEnriched.escola?.nome || null;
      let novoPeriodo = pEnriched.periodo;
      let novaModalidade = pEnriched.modalidade;
      let novaTurma: string | null = null;
      let novaSala: string | null = null;
      let novoNomeProfessor: string | null = null;
      let novoIsento = Boolean(pEnriched.isento);
      let notificacaoEnviadaEm = null;
      let tokenPublico = null;

      if (renovacao) {
        statusReserva = renovacao.status === RenovacaoStatus.CONCLUIDO ? RenovacaoStatus.CONFIRMADO : renovacao.status;
        notificacaoEnviadaEm = renovacao.notificacao_enviada_em;
        tokenPublico = renovacao.token_publico;
        novoIsento = Boolean(renovacao.novo_isento);
        novoValor = novoIsento ? 0 : Number(renovacao.novo_valor_cobranca ?? valorAtual);
        novoVencimento = renovacao.novo_dia_vencimento ?? pEnriched.dia_vencimento;
        novaEscolaId = renovacao.nova_escola_id ?? pEnriched.escola_id;
        novaEscolaNome = renovacao.nova_escola?.nome ?? pEnriched.escola?.nome ?? null;
        novoPeriodo = renovacao.novo_periodo ?? pEnriched.periodo;
        novaModalidade = renovacao.nova_modalidade ?? pEnriched.modalidade;
        novaTurma = renovacao.nova_turma ?? null;
        novaSala = renovacao.nova_sala ?? null;
        novoNomeProfessor = renovacao.novo_nome_professor ?? null;
      } else {
        statusReserva = RenovacaoStatus.PENDENTE;
      }

      if (statusReserva === RenovacaoStatus.CONFIRMADO) {
        countConfirmados++;
        faturamentoProjetado += novoValor;
      } else if (statusReserva === RenovacaoStatus.RECUSADO) {
        countSaidas++;
      } else {
        countPendentes++;
        faturamentoProjetado += novoValor;
        if (!notificacaoEnviadaEm) {
          countNaoNotificados++;
        }
      }

      let novaDataInicioCobranca = renovacao?.nova_data_inicio_cobranca ? String(renovacao.nova_data_inicio_cobranca) : null;
      let novaDataFimCobranca = renovacao?.nova_data_fim_cobranca ? String(renovacao.nova_data_fim_cobranca) : null;
      let novaDataInicioTransporte = renovacao?.nova_data_inicio_transporte ? String(renovacao.nova_data_inicio_transporte) : null;
      let novaDataFimTransporte = renovacao?.nova_data_fim_transporte ? String(renovacao.nova_data_fim_transporte) : null;

      if (!novoIsento) {
        if (!novaDataInicioCobranca && periodoConfig.configurado) {
          novaDataInicioCobranca = _formatMesAnoParaDataISO(periodoConfig.ano_inicio_cobranca, periodoConfig.mes_inicio_cobranca);
        }
        if (!novaDataFimCobranca && periodoConfig.configurado) {
          novaDataFimCobranca = _formatMesAnoParaDataISO(periodoConfig.ano_fim_cobranca, periodoConfig.mes_fim_cobranca);
        }
      }
      if (!novaDataInicioTransporte && periodoConfig.configurado && periodoConfig.data_inicio_transporte) {
        novaDataInicioTransporte = periodoConfig.data_inicio_transporte;
      }
      if (!novaDataFimTransporte && periodoConfig.configurado && periodoConfig.data_fim_transporte) {
        novaDataFimTransporte = periodoConfig.data_fim_transporte;
      }

      return {
        passageiro_id: pEnriched.id,
        nome: pEnriched.nome,
        foto_url: null,
        valor_cobranca_atual: valorAtual,
        dia_vencimento_atual: pEnriched.dia_vencimento,
        escola_id_atual: pEnriched.escola_id,
        escola_nome_atual: pEnriched.escola?.nome || null,
        periodo_atual: pEnriched.periodo,
        modalidade_atual: pEnriched.modalidade,
        turma_atual: pEnriched.turma,
        sala_atual: pEnriched.sala,
        nome_professor_atual: pEnriched.nome_professor,
        veiculo_id_atual: pEnriched.veiculo_id || null,
        isento_atual: pEnriched.isento,
        data_inicio_transporte_atual: pEnriched.data_inicio_transporte || null,
        data_fim_transporte_atual: pEnriched.data_fim_transporte || null,
        data_inicio_cobranca_atual: pEnriched.data_inicio_cobranca || null,
        data_fim_cobranca_atual: pEnriched.data_fim_cobranca || null,
        responsavel_principal: pEnriched.responsavel_principal,

        reserva_id: renovacao?.id || null,
        ano_origem: anoOrigem,
        ano_destino: anoDestino,
        status: statusReserva,
        novo_valor_cobranca: novoValor,
        novo_dia_vencimento: novoVencimento,
        nova_escola_id: novaEscolaId,
        nova_escola_nome: novaEscolaNome,
        novo_periodo: novoPeriodo,
        nova_modalidade: novaModalidade,
        nova_turma: novaTurma,
        nova_sala: novaSala,
        novo_nome_professor: novoNomeProfessor,
        novo_veiculo_id: renovacao?.novo_veiculo_id ?? pEnriched.veiculo_id ?? null,
        nova_data_inicio_transporte: novaDataInicioTransporte,
        nova_data_fim_transporte: novaDataFimTransporte,
        nova_data_inicio_cobranca: novaDataInicioCobranca,
        nova_data_fim_cobranca: novaDataFimCobranca,
        notificacao_enviada_em: notificacaoEnviadaEm,
        token_publico: tokenPublico,
        contrato_id: contratosMap.get(pEnriched.id)?.id || null,
        contrato_status: contratosMap.get(pEnriched.id)?.status || null,
      };
    });

    let filtrados = listConsolidada;

    if (query.status) {
      filtrados = filtrados.filter(item => item.status === query.status);
    }
    if (query.escola_id) {
      filtrados = filtrados.filter(item => item.nova_escola_id === query.escola_id || item.escola_id_atual === query.escola_id);
    }
    if (query.periodo) {
      filtrados = filtrados.filter(item => item.novo_periodo === query.periodo || item.periodo_atual === query.periodo);
    }
    if (query.search && query.search.trim()) {
      const term = query.search.trim().toLowerCase();
      filtrados = filtrados.filter(item =>
        item.nome.toLowerCase().includes(term) ||
        item.responsavel_principal?.nome?.toLowerCase().includes(term) ||
        item.responsavel_principal?.telefone?.includes(term)
      );
    }

    filtrados.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR", { sensitivity: "base" }));

    const percentualCrescimento = faturamentoAtual > 0
      ? Number((((faturamentoProjetado - faturamentoAtual) / faturamentoAtual) * 100).toFixed(1))
      : 0;

    return {
      periodo_config: periodoConfig,
      kpis: {
        faturamento_atual: faturamentoAtual,
        faturamento_projetado: faturamentoProjetado,
        percentual_crescimento: percentualCrescimento,
        contadores: {
          total_ativos: countAtivos,
          confirmados: countConfirmados,
          pendentes: countPendentes,
          nao_notificados: countNaoNotificados,
          saidas: countSaidas,
        },
      },
      passageiros: filtrados,
    };
  },

  async reajusteLote(usuarioId: string, dto: ReajusteLoteDTO) {
    const itens = await renovacaoRepository.listPassageirosComRenovacao(usuarioId, dto.ano_destino);
    const contratosAnoDestino = await contractRepository.listBasicByAno(usuarioId, dto.ano_destino, [
      ContratoStatus.PENDENTE,
      ContratoStatus.ASSINADO,
    ]);

    const passageirosComContratoNoAno = new Set(
      (contratosAnoDestino || []).map((c) => c.passageiro_id)
    );

    const updates: Record<string, unknown>[] = [];
    const confirmadosParaSincronizar: Array<{ passageiro: Record<string, any>; payload: Record<string, any> }> = [];

    for (const { passageiro, renovacao } of itens) {
      if (renovacao?.status === RenovacaoStatus.RECUSADO) {
        continue;
      }
      if (
        renovacao?.status === RenovacaoStatus.CONFIRMADO &&
        passageirosComContratoNoAno.has(passageiro.id)
      ) {
        continue;
      }

      if (dto.passageiro_ids && dto.passageiro_ids.length > 0) {
        if (!dto.passageiro_ids.includes(passageiro.id)) {
          continue;
        }
      } else if (dto.escola_ids && dto.escola_ids.length > 0) {
        const matchOrigem = passageiro.escola_id && dto.escola_ids.includes(passageiro.escola_id);
        const matchDestino = renovacao?.nova_escola_id && dto.escola_ids.includes(renovacao.nova_escola_id);
        if (!matchOrigem && !matchDestino) {
          continue;
        }
      } else if (dto.escola_id && passageiro.escola_id !== dto.escola_id && renovacao?.nova_escola_id !== dto.escola_id) {
        continue;
      }

      const isPassageiroIsento = Boolean(passageiro.isento);

      const isReajusteCobrancaOuParcela = (dto.tipo || dto.tipo_reajuste || dto.data_inicio_cobranca || dto.data_fim_cobranca);
      if (isPassageiroIsento && isReajusteCobrancaOuParcela && !dto.data_inicio_transporte && !dto.data_fim_transporte) {
        continue;
      }

      const tipoReajuste = dto.tipo || dto.tipo_reajuste;
      const valorReajuste = dto.valor !== undefined ? dto.valor : dto.valor_reajuste;

      const valorBase = isPassageiroIsento ? 0 : Number(passageiro.valor_cobranca || 0);
      let novoValor = isPassageiroIsento ? 0 : Number(renovacao?.novo_valor_cobranca ?? valorBase);

      if (!isPassageiroIsento) {
        if (tipoReajuste === RenovacaoReajusteTipo.FIXO && valorReajuste !== undefined) {
          novoValor = valorBase + Number(valorReajuste);
        } else if (tipoReajuste === RenovacaoReajusteTipo.PERCENTUAL && valorReajuste !== undefined) {
          novoValor = valorBase * (1 + Number(valorReajuste) / 100);
        } else if (tipoReajuste === RenovacaoReajusteTipo.VALOR_PADRAO && valorReajuste !== undefined) {
          novoValor = Number(valorReajuste);
        } else if (tipoReajuste === RenovacaoReajusteTipo.MANTER) {
          novoValor = Number(renovacao?.novo_valor_cobranca ?? valorBase);
        }
      }

      novoValor = Number(Math.max(0, novoValor).toFixed(2));

      const payload: Record<string, unknown> = {
        usuario_id: usuarioId,
        passageiro_id: passageiro.id,
        ano_origem: passageiro.ano_letivo || (dto.ano_destino - 1),
        ano_destino: dto.ano_destino,
        status: renovacao?.status || RenovacaoStatus.PENDENTE,
        novo_valor_cobranca: isPassageiroIsento ? 0 : novoValor,
        novo_dia_vencimento: isPassageiroIsento ? null : (renovacao?.novo_dia_vencimento ?? passageiro.dia_vencimento),
        nova_escola_id: renovacao?.nova_escola_id ?? passageiro.escola_id,
        novo_periodo: renovacao?.novo_periodo ?? passageiro.periodo,
        nova_modalidade: renovacao?.nova_modalidade ?? passageiro.modalidade,
        nova_turma: renovacao?.nova_turma ?? null,
        nova_sala: renovacao?.nova_sala ?? null,
        novo_nome_professor: renovacao?.novo_nome_professor ?? null,
        novo_veiculo_id: renovacao?.novo_veiculo_id ?? passageiro.veiculo_id,
        novo_isento: isPassageiroIsento,
        token_publico: renovacao?.token_publico || crypto.randomBytes(16).toString("hex"),
      };

      if (dto.data_inicio_transporte !== undefined) {
        payload.nova_data_inicio_transporte = dto.data_inicio_transporte ? toPersistenceString(dto.data_inicio_transporte) : null;
      } else if (renovacao?.nova_data_inicio_transporte) {
        payload.nova_data_inicio_transporte = renovacao.nova_data_inicio_transporte;
      }

      if (dto.data_fim_transporte !== undefined) {
        payload.nova_data_fim_transporte = dto.data_fim_transporte ? toPersistenceString(dto.data_fim_transporte) : null;
      } else if (renovacao?.nova_data_fim_transporte) {
        payload.nova_data_fim_transporte = renovacao.nova_data_fim_transporte;
      }

      if (!isPassageiroIsento) {
        if (dto.data_inicio_cobranca !== undefined) {
          payload.nova_data_inicio_cobranca = dto.data_inicio_cobranca ? toPersistenceString(dto.data_inicio_cobranca) : null;
        } else if (renovacao?.nova_data_inicio_cobranca) {
          payload.nova_data_inicio_cobranca = renovacao.nova_data_inicio_cobranca;
        }

        if (dto.data_fim_cobranca !== undefined) {
          payload.nova_data_fim_cobranca = dto.data_fim_cobranca ? toPersistenceString(dto.data_fim_cobranca) : null;
        } else if (renovacao?.nova_data_fim_cobranca) {
          payload.nova_data_fim_cobranca = renovacao.nova_data_fim_cobranca;
        }
      } else {
        payload.nova_data_inicio_cobranca = null;
        payload.nova_data_fim_cobranca = null;
      }

      updates.push(payload);
      if (payload.status === RenovacaoStatus.CONFIRMADO) {
        confirmadosParaSincronizar.push({ passageiro, payload });
      }
    }

    const res = await renovacaoRepository.upsertLote(updates);

    for (const { passageiro, payload } of confirmadosParaSincronizar) {
      await _sincronizarMatriculaConfirmada(usuarioId, passageiro, payload, dto.ano_destino);
    }

    return res;
  },

  async atualizarStatusLote(usuarioId: string, dto: AtualizarStatusLoteDTO) {
    const itens = await renovacaoRepository.listPassageirosComRenovacao(usuarioId, dto.ano_destino);
    const targetItens = itens.filter(i => dto.passageiro_ids.includes(i.passageiro.id));

    if (dto.status === RenovacaoStatus.RECUSADO || dto.status === RenovacaoStatus.PENDENTE) {
      for (const item of targetItens) {
        await _validarSemParcelasPagasNoAnoDestino(item.passageiro.id, dto.ano_destino, item.passageiro.nome);
      }
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown>[] = [];
    const payloadsByPassageiro = new Map<string, Record<string, unknown>>();

    for (const item of targetItens) {
      const { passageiro, renovacao } = item;
      const isPassageiroIsento = Boolean(passageiro.isento);

      const payload: Record<string, unknown> = {
        usuario_id: usuarioId,
        passageiro_id: passageiro.id,
        ano_origem: passageiro.ano_letivo || (dto.ano_destino - 1),
        ano_destino: dto.ano_destino,
        status: dto.status,
        novo_valor_cobranca: isPassageiroIsento ? 0 : Number(renovacao?.novo_valor_cobranca ?? passageiro.valor_cobranca ?? 0),
        novo_dia_vencimento: isPassageiroIsento ? null : (renovacao?.novo_dia_vencimento ?? passageiro.dia_vencimento),
        nova_escola_id: renovacao?.nova_escola_id ?? passageiro.escola_id,
        novo_periodo: renovacao?.novo_periodo ?? passageiro.periodo,
        nova_modalidade: renovacao?.nova_modalidade ?? passageiro.modalidade,
        nova_turma: renovacao?.nova_turma ?? null,
        nova_sala: renovacao?.nova_sala ?? null,
        novo_nome_professor: renovacao?.novo_nome_professor ?? null,
        novo_veiculo_id: renovacao?.novo_veiculo_id ?? passageiro.veiculo_id,
        novo_isento: isPassageiroIsento,
        token_publico: renovacao?.token_publico || crypto.randomBytes(16).toString("hex"),
        confirmado_em: dto.status === RenovacaoStatus.CONFIRMADO ? now : null,
      };

      if (renovacao?.nova_data_inicio_transporte) payload.nova_data_inicio_transporte = renovacao.nova_data_inicio_transporte;
      if (renovacao?.nova_data_fim_transporte) payload.nova_data_fim_transporte = renovacao.nova_data_fim_transporte;
      if (renovacao?.nova_data_inicio_cobranca) payload.nova_data_inicio_cobranca = renovacao.nova_data_inicio_cobranca;
      if (renovacao?.nova_data_fim_cobranca) payload.nova_data_fim_cobranca = renovacao.nova_data_fim_cobranca;

      updates.push(payload);
      payloadsByPassageiro.set(passageiro.id, payload);
    }

    const result = await renovacaoRepository.upsertLote(updates);

    if (dto.status === RenovacaoStatus.CONFIRMADO) {
      for (const item of targetItens) {
        const pPayload = payloadsByPassageiro.get(item.passageiro.id) || {};
        await _sincronizarMatriculaConfirmada(usuarioId, item.passageiro, pPayload, dto.ano_destino);
      }

      try {
        const { userRepository } = await import("../repositories/user.repository.js");
        const { data: usuario } = await userRepository.getProfileData(usuarioId);
        const configAno = resolveContractConfigForYear(usuario?.config_contrato as Record<string, any>, dto.ano_destino);
        if (configAno.usar_contratos) {
          const configRenovacao = (usuario?.config_renovacao as ConfigRenovacaoStorage | null) || {};
          const masterConfig = configRenovacao.anos?.[String(dto.ano_destino)];
          const { contractService } = await import("./contract.service.js");
          for (const item of targetItens) {
            const anoOrigem = Number(item.passageiro.ano_letivo || (dto.ano_destino - 1));
            const contratoExistente = await contractRepository.getByPassageiroEAno(item.passageiro.id, dto.ano_destino);
            if (!contratoExistente) {
              const { dataInicio, dataFim } = _resolverDatasTransporteParaContrato(
                item.renovacao?.nova_data_inicio_transporte,
                item.renovacao?.nova_data_fim_transporte,
                masterConfig,
                dto.ano_destino
              );

              await contractService.criarContrato(usuarioId, {
                passageiroId: item.passageiro.id,
                provider: ContratoProvider.INHOUSE,
                ano: dto.ano_destino,
                valorMensal: Number(item.renovacao?.novo_valor_cobranca ?? item.passageiro.valor_cobranca ?? 0),
                diaVencimento: Number(item.renovacao?.novo_dia_vencimento ?? item.passageiro.dia_vencimento ?? 10),
                dataInicio,
                dataFim,
                modalidade: item.renovacao?.nova_modalidade ? String(item.renovacao.nova_modalidade) : (item.passageiro.modalidade || undefined),
                periodo: item.renovacao?.novo_periodo ? String(item.renovacao.novo_periodo) : (item.passageiro.periodo || undefined),
                nomeEscola: item.renovacao?.nova_escola?.nome || item.passageiro.escola?.nome || undefined,
                notificarResponsavel: false,
              });
            }
          }
        }
      } catch (err: unknown) {
        logger.error({ error: err }, "Falha ao gerar contratos em lote para renovações confirmadas");
      }
    } else if (dto.status === RenovacaoStatus.RECUSADO || dto.status === RenovacaoStatus.PENDENTE) {
      for (const item of targetItens) {
        await _removerMatriculaAnoDestinoSePermitido(item.passageiro.id, dto.ano_destino, item.passageiro.nome, true);
      }
    }

    return {
      success: true,
      updated_count: result.length,
    };
  },

  async updateRenovacaoIndividual(usuarioId: string, passageiroId: string, dto: UpdateRenovacaoDTO) {
    const anoOrigem = dto.ano_destino - 1;
    const { data: passageiro } = await passageiroRepository.getById(passageiroId, usuarioId, anoOrigem);
    if (!passageiro) {
      throw new AppError("Passageiro não encontrado.", 404);
    }

    const isPassageiroIsento = Boolean(passageiro.isento);
    const existente = await renovacaoRepository.getByPassageiroEAno(passageiroId, dto.ano_destino);

    const valorAtual = isPassageiroIsento ? 0 : Number(passageiro.valor_cobranca || 0);
    const novoValorFinal = isPassageiroIsento ? 0 : (dto.novo_valor_cobranca !== undefined ? dto.novo_valor_cobranca : (existente?.novo_valor_cobranca ?? valorAtual));
    const novoVencimentoFinal = isPassageiroIsento ? null : (dto.novo_dia_vencimento !== undefined ? dto.novo_dia_vencimento : (existente?.novo_dia_vencimento ?? passageiro.dia_vencimento));

    const valorAnteriorProposto = existente?.novo_valor_cobranca ?? valorAtual;
    const vencimentoAnteriorProposto = existente?.novo_dia_vencimento ?? passageiro.dia_vencimento;
    const escolaAnteriorProposta = existente?.nova_escola_id ?? passageiro.escola_id;
    const periodoAnteriorProposto = existente?.novo_periodo ?? passageiro.periodo;
    const modalidadeAnteriorProposta = existente?.nova_modalidade ?? passageiro.modalidade;
    const dtInicioTranspAnterior = existente?.nova_data_inicio_transporte ? String(existente.nova_data_inicio_transporte) : null;
    const dtFimTranspAnterior = existente?.nova_data_fim_transporte ? String(existente.nova_data_fim_transporte) : null;
    const dtInicioCobrAnterior = existente?.nova_data_inicio_cobranca ? String(existente.nova_data_inicio_cobranca) : null;
    const dtFimCobrAnterior = existente?.nova_data_fim_cobranca ? String(existente.nova_data_fim_cobranca) : null;

    const nextDtInicioTransp = dto.nova_data_inicio_transporte !== undefined
      ? (dto.nova_data_inicio_transporte ? toPersistenceString(dto.nova_data_inicio_transporte) : null)
      : dtInicioTranspAnterior;
    const nextDtFimTransp = dto.nova_data_fim_transporte !== undefined
      ? (dto.nova_data_fim_transporte ? toPersistenceString(dto.nova_data_fim_transporte) : null)
      : dtFimTranspAnterior;
    const nextDtInicioCobr = dto.nova_data_inicio_cobranca !== undefined
      ? (dto.nova_data_inicio_cobranca ? toPersistenceString(dto.nova_data_inicio_cobranca) : null)
      : dtInicioCobrAnterior;
    const nextDtFimCobr = dto.nova_data_fim_cobranca !== undefined
      ? (dto.nova_data_fim_cobranca ? toPersistenceString(dto.nova_data_fim_cobranca) : null)
      : dtFimCobrAnterior;

    const alterouCondicoesContratuais =
      (dto.novo_valor_cobranca !== undefined && Number(dto.novo_valor_cobranca) !== Number(valorAnteriorProposto)) ||
      (dto.novo_dia_vencimento !== undefined && Number(dto.novo_dia_vencimento) !== Number(vencimentoAnteriorProposto)) ||
      (dto.nova_escola_id !== undefined && dto.nova_escola_id !== escolaAnteriorProposta) ||
      (dto.novo_periodo !== undefined && dto.novo_periodo !== periodoAnteriorProposto) ||
      (dto.nova_modalidade !== undefined && dto.nova_modalidade !== modalidadeAnteriorProposta) ||
      (dto.nova_data_inicio_transporte !== undefined && nextDtInicioTransp !== dtInicioTranspAnterior) ||
      (dto.nova_data_fim_transporte !== undefined && nextDtFimTransp !== dtFimTranspAnterior) ||
      (dto.nova_data_inicio_cobranca !== undefined && nextDtInicioCobr !== dtInicioCobrAnterior) ||
      (dto.nova_data_fim_cobranca !== undefined && nextDtFimCobr !== dtFimCobrAnterior);

    const eraConfirmado = existente?.status === RenovacaoStatus.CONFIRMADO;

    const { userRepository } = await import("../repositories/user.repository.js");
    const { data: usuario } = await userRepository.getProfileData(usuarioId);
    const configAno = resolveContractConfigForYear(usuario?.config_contrato as Record<string, any>, dto.ano_destino);
    const contratoExistente = await contractRepository.getByPassageiroEAno(passageiroId, dto.ano_destino);
    const temFluxoContrato = Boolean(configAno.usar_contratos || contratoExistente);

    let targetStatus = dto.status;
    let confirmadoEm: string | null = null;

    if (targetStatus === undefined) {
      if (eraConfirmado && temFluxoContrato && alterouCondicoesContratuais) {
        await _validarSemParcelasPagasNoAnoDestino(passageiroId, dto.ano_destino, passageiro.nome);
        targetStatus = RenovacaoStatus.PENDENTE;
        confirmadoEm = null;
      } else {
        targetStatus = existente?.status || RenovacaoStatus.PENDENTE;
        confirmadoEm = existente?.confirmado_em || null;
      }
    } else if (targetStatus === RenovacaoStatus.CONFIRMADO) {
      confirmadoEm = existente?.confirmado_em || new Date().toISOString();
    } else {
      await _validarSemParcelasPagasNoAnoDestino(passageiroId, dto.ano_destino, passageiro.nome);
      confirmadoEm = null;
    }

    const payload: Record<string, unknown> = {
      usuario_id: usuarioId,
      passageiro_id: passageiroId,
      ano_origem: anoOrigem,
      ano_destino: dto.ano_destino,
      status: targetStatus,
      novo_valor_cobranca: novoValorFinal,
      novo_dia_vencimento: novoVencimentoFinal,
      nova_escola_id: dto.nova_escola_id !== undefined ? dto.nova_escola_id : (existente?.nova_escola_id ?? passageiro.escola_id),
      novo_periodo: dto.novo_periodo !== undefined ? dto.novo_periodo : (existente?.novo_periodo ?? passageiro.periodo),
      nova_modalidade: dto.nova_modalidade !== undefined ? dto.nova_modalidade : (existente?.nova_modalidade ?? passageiro.modalidade),
      nova_turma: dto.nova_turma !== undefined ? dto.nova_turma : (existente?.nova_turma ?? null),
      nova_sala: dto.nova_sala !== undefined ? dto.nova_sala : (existente?.nova_sala ?? null),
      novo_nome_professor: dto.novo_nome_professor !== undefined ? dto.novo_nome_professor : (existente?.novo_nome_professor ?? null),
      novo_veiculo_id: dto.novo_veiculo_id !== undefined ? dto.novo_veiculo_id : (existente?.novo_veiculo_id ?? passageiro.veiculo_id),
      novo_isento: isPassageiroIsento,
      token_publico: existente?.token_publico || crypto.randomBytes(16).toString("hex"),
      confirmado_em: confirmadoEm,
    };

    if (dto.nova_data_inicio_transporte !== undefined) {
      payload.nova_data_inicio_transporte = dto.nova_data_inicio_transporte ? toPersistenceString(dto.nova_data_inicio_transporte) : null;
    } else if (existente?.nova_data_inicio_transporte) {
      payload.nova_data_inicio_transporte = existente.nova_data_inicio_transporte;
    }

    if (dto.nova_data_fim_transporte !== undefined) {
      payload.nova_data_fim_transporte = dto.nova_data_fim_transporte ? toPersistenceString(dto.nova_data_fim_transporte) : null;
    } else if (existente?.nova_data_fim_transporte) {
      payload.nova_data_fim_transporte = existente.nova_data_fim_transporte;
    }

    if (!isPassageiroIsento) {
      if (dto.nova_data_inicio_cobranca !== undefined) {
        payload.nova_data_inicio_cobranca = dto.nova_data_inicio_cobranca ? toPersistenceString(dto.nova_data_inicio_cobranca) : null;
      } else if (existente?.nova_data_inicio_cobranca) {
        payload.nova_data_inicio_cobranca = existente.nova_data_inicio_cobranca;
      }

      if (dto.nova_data_fim_cobranca !== undefined) {
        payload.nova_data_fim_cobranca = dto.nova_data_fim_cobranca ? toPersistenceString(dto.nova_data_fim_cobranca) : null;
      } else if (existente?.nova_data_fim_cobranca) {
        payload.nova_data_fim_cobranca = existente.nova_data_fim_cobranca;
      }
    } else {
      payload.nova_data_inicio_cobranca = null;
      payload.nova_data_fim_cobranca = null;
    }

    const result = await renovacaoRepository.upsertReserva(payload);

    if (targetStatus === RenovacaoStatus.CONFIRMADO) {
      await _sincronizarMatriculaConfirmada(usuarioId, passageiro, payload, dto.ano_destino);

      try {
        if (configAno.usar_contratos) {
          const { contractService } = await import("./contract.service.js");

          let nomeEscolaDestino = passageiro.escola?.nome || undefined;
          if (payload.nova_escola_id && payload.nova_escola_id !== passageiro.escola_id) {
            const { data: esc } = await escolaRepository.getById(String(payload.nova_escola_id));
            if (esc?.nome) nomeEscolaDestino = esc.nome;
          }

          if (!contratoExistente) {
            const configRenovacao = (usuario?.config_renovacao as ConfigRenovacaoStorage | null) || {};
            const masterConfig = configRenovacao.anos?.[String(dto.ano_destino)];
            const { dataInicio, dataFim } = _resolverDatasTransporteParaContrato(
              payload.nova_data_inicio_transporte ? String(payload.nova_data_inicio_transporte) : null,
              payload.nova_data_fim_transporte ? String(payload.nova_data_fim_transporte) : null,
              masterConfig,
              dto.ano_destino
            );

            await contractService.criarContrato(usuarioId, {
              passageiroId,
              provider: ContratoProvider.INHOUSE,
              ano: dto.ano_destino,
              valorMensal: Number(payload.novo_valor_cobranca ?? passageiro.valor_cobranca),
              diaVencimento: Number(payload.novo_dia_vencimento ?? passageiro.dia_vencimento),
              dataInicio,
              dataFim,
              modalidade: payload.nova_modalidade ? String(payload.nova_modalidade) : (passageiro.modalidade || undefined),
              periodo: payload.novo_periodo ? String(payload.novo_periodo) : (passageiro.periodo || undefined),
              nomeEscola: nomeEscolaDestino,
              notificarResponsavel: false,
            });
          }
        }
      } catch (contractErr: unknown) {
        logger.warn({ error: contractErr instanceof Error ? contractErr.message : String(contractErr), passageiroId }, "[Renovacao] Não foi possível gerar contrato automático na confirmação individual");
      }
    } else if (targetStatus === RenovacaoStatus.RECUSADO || targetStatus === RenovacaoStatus.PENDENTE) {
      await _removerMatriculaAnoDestinoSePermitido(passageiroId, dto.ano_destino, passageiro.nome, true);
    }

    return result;
  },

  async getPublicRenovacao(token: string) {
    const data = await renovacaoRepository.getByToken(token);
    if (!data || !data.passageiro) {
      throw new AppError("Proposta de renovação não encontrada ou link inválido.", 404);
    }

    const { passageiro, motorista, nova_escola } = data;
    const pEnriched = _enrichPassageiroResponsavel(passageiro);

    const valorAtual = pEnriched.isento ? 0 : Number(pEnriched.valor_cobranca || 0);
    const novoValor = Boolean(data.novo_isento) ? 0 : Number(data.novo_valor_cobranca ?? valorAtual);

    const escolaAtualNome = pEnriched.escola?.nome || null;
    const novaEscolaNome = nova_escola?.nome ?? escolaAtualNome;

    const vencimentoAtual = pEnriched.dia_vencimento;
    const novoVencimento = data.novo_dia_vencimento ?? vencimentoAtual;

    const periodoAtual = pEnriched.periodo;
    const novoPeriodo = data.novo_periodo ?? periodoAtual;

    const modalidadeAtual = pEnriched.modalidade;
    const novaModalidade = data.nova_modalidade ?? modalidadeAtual;

    const configContratoAno = resolveContractConfigForYear(motorista?.config_contrato as Record<string, any>, data.ano_destino);
    let contratoInfo: {
      usar_contratos: boolean;
      id: string | null;
      status: string | null;
      token_acesso: string | null;
    } = {
      usar_contratos: Boolean(configContratoAno.usar_contratos),
      id: null,
      status: null,
      token_acesso: null,
    };

    if (configContratoAno.usar_contratos) {
      const contrato = await contractRepository.getByPassageiroEAno(passageiro.id, data.ano_destino);
      if (contrato) {
        contratoInfo.id = contrato.id;
        contratoInfo.status = contrato.status;
        contratoInfo.token_acesso = contrato.token_acesso;
      }
    }

    let dtInicioTransp = data.nova_data_inicio_transporte ? String(data.nova_data_inicio_transporte) : null;
    let dtFimTransp = data.nova_data_fim_transporte ? String(data.nova_data_fim_transporte) : null;
    let dtInicioCobr = data.nova_data_inicio_cobranca ? String(data.nova_data_inicio_cobranca) : null;
    let dtFimCobr = data.nova_data_fim_cobranca ? String(data.nova_data_fim_cobranca) : null;

    if (!Boolean(data.novo_isento) && (!dtInicioCobr || !dtFimCobr || !dtInicioTransp || !dtFimTransp)) {
      const configRenovacao = (motorista?.config_renovacao as ConfigRenovacaoStorage | null) || {};
      const masterConfig = configRenovacao.anos?.[String(data.ano_destino)];
      if (masterConfig) {
        if (!dtInicioCobr) {
          dtInicioCobr = _formatMesAnoParaDataISO(masterConfig.ano_inicio_cobranca, masterConfig.mes_inicio_cobranca);
        }
        if (!dtFimCobr) {
          dtFimCobr = _formatMesAnoParaDataISO(masterConfig.ano_fim_cobranca, masterConfig.mes_fim_cobranca);
        }
        if (!dtInicioTransp && masterConfig.data_inicio_transporte) {
          dtInicioTransp = String(masterConfig.data_inicio_transporte);
        }
        if (!dtFimTransp && masterConfig.data_fim_transporte) {
          dtFimTransp = String(masterConfig.data_fim_transporte);
        }
      }
    }

    let qtdParcelas = 11;
    if (dtInicioCobr && dtFimCobr) {
      try {
        const d1 = new Date(dtInicioCobr);
        const d2 = new Date(dtFimCobr);
        const months = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth()) + 1;
        if (months > 0 && months <= 12) {
          qtdParcelas = months;
        }
      } catch {
      }
    }

    const escolasMotorista = await escolaRepository.listAtivasByUsuario(data.usuario_id);

    const effectiveStatus = data.status === RenovacaoStatus.CONCLUIDO ? RenovacaoStatus.CONFIRMADO : data.status;

    return {
      token_publico: data.token_publico,
      status: effectiveStatus,
      confirmado_em: data.confirmado_em,
      recusado_em: data.recusado_em,
      concluido: false,
      ano_origem: data.ano_origem,
      ano_destino: data.ano_destino,
      escolas_disponiveis: (escolasMotorista || []).map((e) => ({
        id: e.id,
        nome: e.nome,
      })),
      motorista: {
        id: motorista.id,
        nome: motorista.nome,
        apelido: motorista.apelido,
        telefone: motorista.telefone,
        logo_url: motorista.logo_url,
        usar_contratos: Boolean(configContratoAno.usar_contratos),
      },
      passageiro: {
        id: passageiro.id,
        nome: passageiro.nome,
        data_nascimento: passageiro.data_nascimento || null,
        turma: data.nova_turma || null,
        sala: data.nova_sala || null,
        nome_professor: data.novo_nome_professor || null,
        observacoes: passageiro.observacoes || null,
        foto_url: null,
      },
      responsavel: pEnriched.responsavel_principal ? {
        id: pEnriched.responsavel_principal.id,
        nome: pEnriched.responsavel_principal.nome,
        telefone: pEnriched.responsavel_principal.telefone,
        cpf: pEnriched.responsavel_principal.cpf,
        email: pEnriched.responsavel_principal.email,
        parentesco: pEnriched.responsavel_principal.parentesco,
        cep: pEnriched.responsavel_principal.cep || null,
        logradouro: pEnriched.responsavel_principal.logradouro || null,
        numero: pEnriched.responsavel_principal.numero || null,
        bairro: pEnriched.responsavel_principal.bairro || null,
        cidade: pEnriched.responsavel_principal.cidade || null,
        estado: pEnriched.responsavel_principal.estado || null,
        complemento: pEnriched.responsavel_principal.complemento || null,
        referencia: pEnriched.responsavel_principal.referencia || null,
      } : null,
      observacoes_pais: data.observacoes_pais || null,
      condicoes: {
        valor: {
          atual: valorAtual,
          novo: novoValor,
          alterado: valorAtual !== novoValor,
        },
        dia_vencimento: {
          atual: vencimentoAtual,
          novo: novoVencimento,
          alterado: vencimentoAtual !== novoVencimento,
        },
        escola: {
          atual_id: pEnriched.escola_id || null,
          atual: escolaAtualNome,
          novo_id: data.nova_escola_id ?? pEnriched.escola_id ?? null,
          novo: novaEscolaNome,
          alterado: (pEnriched.escola_id || null) !== (data.nova_escola_id ?? pEnriched.escola_id ?? null),
        },
        periodo: {
          atual: periodoAtual,
          novo: novoPeriodo,
          alterado: periodoAtual !== novoPeriodo,
        },
        modalidade: {
          atual: modalidadeAtual,
          novo: novaModalidade,
          alterado: modalidadeAtual !== novaModalidade,
        },
        turma: {
          atual: passageiro.turma || null,
          novo: data.nova_turma ?? null,
          alterado: Boolean(data.nova_turma && data.nova_turma !== passageiro.turma),
        },
        sala: {
          atual: passageiro.sala || null,
          novo: data.nova_sala ?? null,
          alterado: Boolean(data.nova_sala && data.nova_sala !== passageiro.sala),
        },
        nome_professor: {
          atual: passageiro.nome_professor || null,
          novo: data.novo_nome_professor ?? null,
          alterado: Boolean(data.novo_nome_professor && data.novo_nome_professor !== passageiro.nome_professor),
        },
        data_inicio_transporte: dtInicioTransp,
        data_fim_transporte: dtFimTransp,
        data_inicio_cobranca: dtInicioCobr,
        data_fim_cobranca: dtFimCobr,
        qtd_parcelas: qtdParcelas,
      },
      contrato: contratoInfo,
    };
  },

  async atualizarDadosPublicos(token: string, dto: AtualizarDadosPublicosDTO) {
    const data = await renovacaoRepository.getByToken(token);
    if (!data || !data.passageiro) {
      throw new AppError("Proposta de renovação não encontrada ou expirada.", 404);
    }

    if (data.status !== RenovacaoStatus.PENDENTE) {
      throw new AppError("Os dados só podem ser atualizados pelo link de renovação enquanto a proposta estiver pendente.", 400);
    }

    const { passageiro } = data;
    const pEnriched = _enrichPassageiroResponsavel(passageiro);
    const responsavelId = pEnriched.responsavel_principal?.id || null;

    const rInput = (dto.responsavel || {}) as NonNullable<AtualizarDadosPublicosDTO["responsavel"]>;
    const pInput = (dto.passageiro || {}) as NonNullable<AtualizarDadosPublicosDTO["passageiro"]>;

    const nomeResp = rInput.nome !== undefined ? rInput.nome : dto.nome_responsavel;
    const telResp = rInput.telefone !== undefined ? rInput.telefone : dto.telefone_responsavel;
    const cpfResp = rInput.cpf !== undefined ? rInput.cpf : dto.cpf_responsavel;
    const emailResp = rInput.email !== undefined ? rInput.email : dto.email_responsavel;
    const parentescoResp = rInput.parentesco !== undefined ? rInput.parentesco : dto.parentesco_responsavel;
    const cepResp = rInput.cep !== undefined ? rInput.cep : dto.cep;
    const logradouroResp = rInput.logradouro !== undefined ? rInput.logradouro : dto.logradouro;
    const numeroResp = rInput.numero !== undefined ? rInput.numero : dto.numero;
    const bairroResp = rInput.bairro !== undefined ? rInput.bairro : dto.bairro;
    const cidadeResp = rInput.cidade !== undefined ? rInput.cidade : dto.cidade;
    const estadoResp = rInput.estado !== undefined ? rInput.estado : dto.estado;
    const complementoResp = rInput.complemento !== undefined ? rInput.complemento : dto.complemento;
    const referenciaResp = rInput.referencia !== undefined ? rInput.referencia : dto.referencia;

    const dadosResponsavel: Record<string, unknown> = {};
    if (nomeResp !== undefined && nomeResp !== null) dadosResponsavel.nome = cleanString(nomeResp, true);
    if (telResp !== undefined && telResp !== null) dadosResponsavel.telefone = normalizePhone(telResp);
    if (cpfResp !== undefined) dadosResponsavel.cpf = cpfResp ? onlyDigits(cpfResp) : null;
    if (emailResp !== undefined) dadosResponsavel.email = emailResp ? cleanString(emailResp.trim().toLowerCase()) : null;
    if (cepResp !== undefined) dadosResponsavel.cep = cepResp ? onlyDigits(cepResp) : null;
    if (logradouroResp !== undefined) dadosResponsavel.logradouro = logradouroResp ? cleanString(logradouroResp, true) : null;
    if (numeroResp !== undefined) dadosResponsavel.numero = numeroResp ? String(numeroResp).trim() : null;
    if (bairroResp !== undefined) dadosResponsavel.bairro = bairroResp ? cleanString(bairroResp, true) : null;
    if (cidadeResp !== undefined) dadosResponsavel.cidade = cidadeResp ? cleanString(cidadeResp, true) : null;
    if (estadoResp !== undefined) dadosResponsavel.estado = estadoResp ? String(estadoResp).trim().toUpperCase() : null;
    if (complementoResp !== undefined) dadosResponsavel.complemento = complementoResp ? cleanString(complementoResp, true) : null;
    if (referenciaResp !== undefined) dadosResponsavel.referencia = referenciaResp ? cleanString(referenciaResp, true) : null;

    const turmaVal = pInput.turma !== undefined ? pInput.turma : dto.turma;
    const salaVal = pInput.sala !== undefined ? pInput.sala : dto.sala;
    const profVal = pInput.nome_professor !== undefined ? pInput.nome_professor : dto.nome_professor;
    const obsVal = pInput.observacoes !== undefined ? pInput.observacoes : dto.observacoes;
    const dtNascVal = pInput.data_nascimento;
    const escolaIdVal = pInput.escola_id !== undefined ? pInput.escola_id : dto.escola_id;
    const periodoVal = pInput.periodo !== undefined ? pInput.periodo : dto.periodo;
    const modalidadeVal = pInput.modalidade !== undefined ? pInput.modalidade : dto.modalidade;

    const dadosReserva: Record<string, unknown> = {};
    const dadosMatriculaDestino: Record<string, unknown> = {};

    if (escolaIdVal !== undefined) {
      const cleanEscolaId = cleanString(escolaIdVal);
      if (!cleanEscolaId) {
        throw new AppError("O campo Escola é obrigatório e não pode ficar em branco.", 400);
      }

      const { data: escolaValida } = await escolaRepository.getById(cleanEscolaId, data.usuario_id);

      if (!escolaValida) {
        throw new AppError("Escola selecionada não encontrada ou indisponível.", 400);
      }

      dadosReserva.nova_escola_id = cleanEscolaId;
      dadosMatriculaDestino.escola_id = cleanEscolaId;
    }

    if (periodoVal !== undefined) {
      const cleanPeriodo = cleanString(periodoVal, true);
      if (!cleanPeriodo) {
        throw new AppError("O campo Turno é obrigatório e não pode ficar em branco.", 400);
      }
      dadosReserva.novo_periodo = cleanPeriodo;
      dadosMatriculaDestino.periodo = cleanPeriodo;
    }

    if (modalidadeVal !== undefined) {
      const cleanModalidade = cleanString(modalidadeVal);
      if (!cleanModalidade) {
        throw new AppError("O campo Modalidade é obrigatório e não pode ficar em branco.", 400);
      }
      dadosReserva.nova_modalidade = cleanModalidade;
      dadosMatriculaDestino.modalidade = cleanModalidade;
    }

    const dadosPassageiro: Record<string, unknown> = {};
    if (obsVal !== undefined) dadosPassageiro.observacoes = obsVal ? cleanString(obsVal, true) : null;
    if (dtNascVal !== undefined) dadosPassageiro.data_nascimento = dtNascVal || null;

    if (turmaVal !== undefined) dadosReserva.nova_turma = turmaVal ? cleanString(turmaVal, true) : null;
    if (salaVal !== undefined) dadosReserva.nova_sala = salaVal ? cleanString(salaVal, true) : null;
    if (profVal !== undefined) dadosReserva.novo_nome_professor = profVal ? cleanString(profVal, true) : null;
    if (dto.observacoes_pais !== undefined) dadosReserva.observacoes_pais = dto.observacoes_pais;

    if (turmaVal !== undefined) dadosMatriculaDestino.turma = turmaVal ? cleanString(turmaVal, true) : null;
    if (salaVal !== undefined) dadosMatriculaDestino.sala = salaVal ? cleanString(salaVal, true) : null;
    if (profVal !== undefined) dadosMatriculaDestino.nome_professor = profVal ? cleanString(profVal, true) : null;

    await renovacaoRepository.atualizarDadosPublicos(
      data.id,
      passageiro.id,
      data.ano_destino,
      responsavelId,
      parentescoResp,
      dadosResponsavel,
      dadosPassageiro,
      dadosReserva,
      dadosMatriculaDestino
    );

    return this.getPublicRenovacao(token);
  },

  async responderPublico(token: string, status: RenovacaoStatus, observacoesPais?: string | null) {
    const data = await renovacaoRepository.getByToken(token);
    if (!data || !data.passageiro) {
      throw new AppError("Proposta de renovação não encontrada ou expirada.", 404);
    }

    if (data.status !== RenovacaoStatus.PENDENTE) {
      throw new AppError(
        `Sua resposta para o ano letivo de ${data.ano_destino} já foi registrada. Para solicitar alterações, entre em contato diretamente com o motorista pelo WhatsApp.`,
        400
      );
    }

    const { passageiro, motorista, nova_escola } = data;
    const pEnriched = _enrichPassageiroResponsavel(passageiro);

    const now = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      status,
      confirmado_em: status === RenovacaoStatus.CONFIRMADO ? now : null,
      recusado_em: status === RenovacaoStatus.RECUSADO ? now : null,
    };

    if (observacoesPais !== undefined) {
      updatePayload.observacoes_pais = observacoesPais;
    }

    await renovacaoRepository.updateStatusRespostaPublica(data.id, updatePayload);

    let contratoGerado = null;

    const configContratoAno = resolveContractConfigForYear(motorista?.config_contrato as Record<string, any>, data.ano_destino);

    if (status === RenovacaoStatus.CONFIRMADO) {
      await _sincronizarMatriculaConfirmada(motorista.id, passageiro, data, data.ano_destino);

      if (configContratoAno.usar_contratos) {
        try {
          const contratoExistente = await contractRepository.getByPassageiroEAno(passageiro.id, data.ano_destino);
          if (!contratoExistente) {
            const configRenovacao = (motorista?.config_renovacao as ConfigRenovacaoStorage | null) || {};
            const masterConfig = configRenovacao.anos?.[String(data.ano_destino)];
            const { dataInicio, dataFim } = _resolverDatasTransporteParaContrato(
              data.nova_data_inicio_transporte ? String(data.nova_data_inicio_transporte) : null,
              data.nova_data_fim_transporte ? String(data.nova_data_fim_transporte) : null,
              masterConfig,
              data.ano_destino
            );

            const { contractService } = await import("./contract.service.js");
            const contrato = await contractService.criarContrato(motorista.id, {
              passageiroId: passageiro.id,
              provider: ContratoProvider.INHOUSE,
              ano: data.ano_destino,
              valorMensal: Number(data.novo_valor_cobranca ?? passageiro.valor_cobranca),
              diaVencimento: Number(data.novo_dia_vencimento ?? passageiro.dia_vencimento),
              dataInicio,
              dataFim,
              modalidade: data.nova_modalidade || passageiro.modalidade || undefined,
              nomeEscola: nova_escola?.nome || passageiro.escola?.nome || undefined,
              periodo: data.novo_periodo || passageiro.periodo || undefined,
              notificarResponsavel: false,
            });

            if (contrato) {
              contratoGerado = {
                id: contrato.id,
                token_acesso: contrato.token_acesso,
                link_assinatura: `/assinar/${contrato.token_acesso}`,
              };
            }
          } else {
            contratoGerado = {
              id: contratoExistente.id,
              token_acesso: contratoExistente.token_acesso,
              link_assinatura: `/assinar/${contratoExistente.token_acesso}`,
            };
          }
        } catch (contractErr: unknown) {
          logger.error({ error: contractErr instanceof Error ? contractErr.message : String(contractErr), passageiroId: passageiro.id }, "[Renovacao] Erro ao gerar contrato automático na renovação confirmada");
        }
      }
    } else if (status === RenovacaoStatus.RECUSADO || status === RenovacaoStatus.PENDENTE) {
      await _removerMatriculaAnoDestinoSePermitido(passageiro.id, data.ano_destino, passageiro.nome);
    }

    const respNome = pEnriched.responsavel_principal?.nome || "Responsável";
    const passNome = passageiro.nome;
    const acaoTitulo = status === RenovacaoStatus.CONFIRMADO
      ? "🎉 Renovação Confirmada!"
      : status === RenovacaoStatus.RECUSADO
      ? "⚠️ Saída Registrada"
      : "ℹ️ Resposta Revertida";
    const acaoCorpo = status === RenovacaoStatus.CONFIRMADO
      ? `${respNome} confirmou a vaga de ${passNome} para o ano letivo de ${data.ano_destino}.`
      : status === RenovacaoStatus.RECUSADO
      ? `${respNome} informou que não irá renovar o transporte de ${passNome} para ${data.ano_destino}.`
      : `${respNome} reverteu a resposta da vaga de ${passNome} para pendente.`;

    try {
      await historicoRepository.insert({
        usuario_id: motorista.id,
        entidade_tipo: "passageiro",
        entidade_id: passageiro.id,
        acao: status === RenovacaoStatus.CONFIRMADO ? "renovacao_confirmada" : status === RenovacaoStatus.RECUSADO ? "renovacao_recusada" : "renovacao_revertida",
        descricao: acaoCorpo,
      });
    } catch {
    }

    if (status !== RenovacaoStatus.PENDENTE) {
      try {
        await notificationService.sendDirect(
          NotificationChannelEnum.FIREBASE,
          EVENTO_MOTORISTA_RENOVACAO_RESPOSTA_RECEBIDA,
          {
            usuarioId: motorista.id,
            titulo: acaoTitulo,
            corpo: acaoCorpo,
          },
          { usuarioId: motorista.id }
        );
      } catch {
      }
    }

    return {
      status,
      ano_destino: data.ano_destino,
      contrato: contratoGerado,
    };
  },

  async notificarPassageiro(usuarioId: string, passageiroId: string, anoDestino: number) {
    const anoOrigem = anoDestino - 1;
    const passageiro = await passageiroRepository.getByIdCompleto(passageiroId, usuarioId, anoOrigem);
    if (!passageiro) {
      throw new AppError("Passageiro não encontrado.", 404);
    }

    const pEnriched = _enrichPassageiroResponsavel(passageiro as PassageiroComRenovacaoItem["passageiro"]);
    const respTelefone = pEnriched.responsavel_principal?.telefone;
    if (!respTelefone) {
      throw new AppError("O aluno não possui telefone de responsável cadastrado para envio de WhatsApp.", 400);
    }

    let renovacao = await renovacaoRepository.getByPassageiroEAno(passageiroId, anoDestino);
    let tokenPublico = renovacao?.token_publico;

    if (!renovacao) {
      tokenPublico = crypto.randomBytes(16).toString("hex");
      renovacao = await renovacaoRepository.upsertReserva({
        usuario_id: usuarioId,
        passageiro_id: passageiroId,
        ano_origem: anoOrigem,
        ano_destino: anoDestino,
        status: RenovacaoStatus.PENDENTE,
        novo_valor_cobranca: passageiro.valor_cobranca,
        novo_dia_vencimento: passageiro.dia_vencimento,
        nova_escola_id: passageiro.escola_id,
        novo_periodo: passageiro.periodo,
        nova_modalidade: passageiro.modalidade,
        novo_isento: Boolean(passageiro.isento),
        token_publico: tokenPublico,
      });
    } else if (!tokenPublico) {
      tokenPublico = crypto.randomBytes(16).toString("hex");
      await renovacaoRepository.updateReserva(renovacao.id, { token_publico: tokenPublico });
    }

    const { data: usuario } = await userRepository.getProfileData(usuarioId);

    const { EVENTO_PASSAGEIRO_RENOVACAO_DISPONIVEL } = await import("../config/constants.js");
    const { getDriverDisplayName } = await import("../utils/format.js");

    const linkRenovacao = `${env.FRONTEND_URL}/renovacao/${tokenPublico}`;

    await notificationService.notifyPassenger(
      respTelefone,
      EVENTO_PASSAGEIRO_RENOVACAO_DISPONIVEL,
      {
        nomeResponsavel: pEnriched.responsavel_principal?.nome || "Responsável",
        nomePassageiro: passageiro.nome,
        generoPassageiro: passageiro.genero,
        nomeMotorista: getDriverDisplayName(usuario || {}),
        apelidoMotorista: usuario?.apelido || undefined,
        anoLetivo: anoDestino,
        linkRenovacao,
        tokenRenovacao: tokenPublico,
        passageiroId: passageiro.id,
        usuarioId,
      },
      {
        channels: [NotificationChannelEnum.WABA],
        passageiroId: passageiro.id,
        usuarioId,
      }
    );

    const now = new Date().toISOString();
    await renovacaoRepository.updateReserva(renovacao.id, { notificacao_enviada_em: now });

    return {
      success: true,
      token_publico: tokenPublico,
      notificacao_enviada_em: now,
    };
  },

  async notificarLote(usuarioId: string, anoDestino: number, passageiroIds?: string[]) {
    const itens = await renovacaoRepository.listPassageirosComRenovacao(usuarioId, anoDestino);
    let targetItens = itens;

    if (passageiroIds && passageiroIds.length > 0) {
      targetItens = targetItens.filter(i => passageiroIds.includes(i.passageiro.id));
    } else {
      targetItens = targetItens.filter(i => (i.renovacao?.status || RenovacaoStatus.PENDENTE) === RenovacaoStatus.PENDENTE);
    }

    targetItens = targetItens.filter(i => !i.renovacao?.notificacao_enviada_em);

    let enviados = 0;
    let falhas = 0;

    for (const item of targetItens) {
      try {
        await this.notificarPassageiro(usuarioId, item.passageiro.id, anoDestino);
        enviados++;
      } catch (err: unknown) {
        falhas++;
        logger.warn({ passageiroId: item.passageiro.id, error: err instanceof Error ? err.message : String(err) }, "[Renovacao] Falha ao notificar passageiro em lote");
      }
    }

    return {
      total: targetItens.length,
      enviados,
      falhas,
    };
  },
};
