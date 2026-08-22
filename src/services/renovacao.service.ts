import crypto from "node:crypto";
import { renovacaoRepository } from "../repositories/renovacao.repository.js";
import { passageiroRepository } from "../repositories/passageiro.repository.js";
import { AppError } from "../errors/AppError.js";
import {
  ListRenovacoesQueryDTO,
  ReajusteLoteDTO,
  UpdateRenovacaoDTO,
  VirarAnoLetivoDTO,
} from "../types/dtos/renovacao.dto.js";
import {
  NotificationChannelEnum,
  RenovacaoMotivoRecusa,
  RenovacaoReajusteTipo,
  RenovacaoStatus,
  TipoResponsavel,
} from "../types/enums.js";
import { toPersistenceString } from "../utils/date.utils.js";
import { cleanString } from "../utils/string.utils.js";
import { notificationService } from "./notifications/notification.service.js";

const _enrichPassageiroResponsavel = (p: any) => {
  if (!p) return p;
  const links = (p.responsaveis as any[]) || [];
  const principalLink = links.find((l: any) => l.tipo === TipoResponsavel.PRINCIPAL) || links[0];
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
    } : null,
  };
};

export const renovacaoService = {
  async getDashboardRenovacao(usuarioId: string, query: ListRenovacoesQueryDTO) {
    const anoDestino = query.ano_destino || 2027;
    const itens = await renovacaoRepository.listPassageirosComRenovacao(usuarioId, anoDestino);

    let faturamentoAtual = 0;
    let faturamentoProjetado = 0;
    let countAtivos = 0;
    let countConfirmados = 0;
    let countPendentes = 0;
    let countNaoNotificados = 0;
    let countSaidas = 0;

    const listConsolidada = itens.map(({ passageiro, renovacao }: { passageiro: any; renovacao: any }) => {
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
      let novaTurma = pEnriched.turma;
      let novoNomeProfessor = pEnriched.nome_professor;
      let novoIsento = Boolean(pEnriched.isento);
      let notificacaoEnviadaEm = null;
      let tokenPublico = null;

      if (renovacao) {
        statusReserva = renovacao.status;
        notificacaoEnviadaEm = renovacao.notificacao_enviada_em;
        tokenPublico = renovacao.token_publico;
        novoIsento = Boolean(renovacao.novo_isento);
        novoValor = novoIsento ? 0 : Number(renovacao.novo_valor_cobranca ?? valorAtual);
        novoVencimento = renovacao.novo_dia_vencimento ?? pEnriched.dia_vencimento;
        novaEscolaId = renovacao.nova_escola_id ?? pEnriched.escola_id;
        novaEscolaNome = renovacao.nova_escola?.nome ?? pEnriched.escola?.nome ?? null;
        novoPeriodo = renovacao.novo_periodo ?? pEnriched.periodo;
        novaModalidade = renovacao.nova_modalidade ?? pEnriched.modalidade;
        novaTurma = renovacao.nova_turma ?? pEnriched.turma;
        novoNomeProfessor = renovacao.novo_nome_professor ?? pEnriched.nome_professor;
      } else {
        statusReserva = RenovacaoStatus.PENDENTE;
      }

      if (statusReserva === RenovacaoStatus.CONFIRMADO_MANUAL || statusReserva === RenovacaoStatus.CONFIRMADO_ONLINE) {
        countConfirmados++;
        faturamentoProjetado += novoValor;
      } else if (statusReserva === RenovacaoStatus.RECUSADO_MOTORISTA || statusReserva === RenovacaoStatus.RECUSADO_PAIS) {
        countSaidas++;
      } else {
        countPendentes++;
        faturamentoProjetado += novoValor;
      }

      return {
        passageiro_id: pEnriched.id,
        nome: pEnriched.nome,
        valor_cobranca_atual: valorAtual,
        dia_vencimento_atual: pEnriched.dia_vencimento,
        escola_atual_id: pEnriched.escola_id,
        escola_atual_nome: pEnriched.escola?.nome || null,
        periodo_atual: pEnriched.periodo,
        modalidade_atual: pEnriched.modalidade,
        turma_atual: pEnriched.turma,
        nome_professor_atual: pEnriched.nome_professor,
        isento_atual: pEnriched.isento,
        responsavel_principal: pEnriched.responsavel_principal,
        
        reserva_id: renovacao?.id || null,
        ano_destino: anoDestino,
        status: statusReserva,
        novo_valor_cobranca: novoValor,
        novo_dia_vencimento: novoVencimento,
        nova_escola_id: novaEscolaId,
        nova_escola_nome: novaEscolaNome,
        novo_periodo: novoPeriodo,
        nova_modalidade: novaModalidade,
        nova_turma: novaTurma,
        novo_nome_professor: novoNomeProfessor,
        novo_isento: novoIsento,
        motivo_recusa: renovacao?.motivo_recusa || null,
        justificativa_recusa: renovacao?.justificativa_recusa || null,
        quem_recusou: renovacao?.quem_recusou || null,
        notificacao_enviada_em: notificacaoEnviadaEm,
        token_publico: tokenPublico,
        observacoes_pais: renovacao?.observacoes_pais || null,
      };
    });

    let filtrados = listConsolidada;

    if (query.status) {
      filtrados = filtrados.filter(item => item.status === query.status);
    }
    if (query.escola_id) {
      filtrados = filtrados.filter(item => item.nova_escola_id === query.escola_id || item.escola_atual_id === query.escola_id);
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

    const percentualCrescimento = faturamentoAtual > 0
      ? Number((((faturamentoProjetado - faturamentoAtual) / faturamentoAtual) * 100).toFixed(1))
      : 0;

    return {
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
    const updates: Record<string, unknown>[] = [];

    for (const { passageiro, renovacao } of (itens as any[])) {
      if (dto.escola_ids && dto.escola_ids.length > 0) {
        const matchOrigem = passageiro.escola_id && dto.escola_ids.includes(passageiro.escola_id);
        const matchDestino = renovacao?.nova_escola_id && dto.escola_ids.includes(renovacao.nova_escola_id);
        if (!matchOrigem && !matchDestino) {
          continue;
        }
      } else if (dto.escola_id && passageiro.escola_id !== dto.escola_id && renovacao?.nova_escola_id !== dto.escola_id) {
        continue;
      }

      if (passageiro.isento || renovacao?.novo_isento) {
        continue;
      }

      const valorBase = Number(passageiro.valor_cobranca || 0);
      let novoValor = valorBase;

      if (dto.tipo === RenovacaoReajusteTipo.FIXO) {
        novoValor = valorBase + Number(dto.valor);
      } else if (dto.tipo === RenovacaoReajusteTipo.PERCENTUAL) {
        novoValor = valorBase * (1 + Number(dto.valor) / 100);
      } else if (dto.tipo === RenovacaoReajusteTipo.VALOR_PADRAO) {
        novoValor = Number(dto.valor);
      } else if (dto.tipo === RenovacaoReajusteTipo.MANTER) {
        novoValor = Number(renovacao?.novo_valor_cobranca ?? valorBase);
      }

      novoValor = Number(Math.max(0, novoValor).toFixed(2));

      const payload: Record<string, unknown> = {
        usuario_id: usuarioId,
        passageiro_id: passageiro.id,
        ano_origem: passageiro.ano_letivo || 2026,
        ano_destino: dto.ano_destino,
        status: renovacao?.status || RenovacaoStatus.PENDENTE,
        novo_valor_cobranca: novoValor,
        novo_dia_vencimento: renovacao?.novo_dia_vencimento ?? passageiro.dia_vencimento,
        nova_escola_id: renovacao?.nova_escola_id ?? passageiro.escola_id,
        novo_periodo: renovacao?.novo_periodo ?? passageiro.periodo,
        nova_modalidade: renovacao?.nova_modalidade ?? passageiro.modalidade,
        nova_turma: renovacao?.nova_turma ?? passageiro.turma,
        novo_nome_professor: renovacao?.novo_nome_professor ?? passageiro.nome_professor,
        novo_veiculo_id: renovacao?.novo_veiculo_id ?? passageiro.veiculo_id,
        novo_isento: false,
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

      updates.push(payload);
    }

    return renovacaoRepository.upsertLote(updates);
  },

  async updateRenovacaoIndividual(usuarioId: string, passageiroId: string, dto: UpdateRenovacaoDTO) {
    const { data: passageiro } = await passageiroRepository.getById(passageiroId, usuarioId);
    if (!passageiro) {
      throw new AppError("Passageiro não encontrado.", 404);
    }

    const existente = await renovacaoRepository.getByPassageiroEAno(passageiroId, dto.ano_destino);

    const payload: Record<string, unknown> = {
      usuario_id: usuarioId,
      passageiro_id: passageiroId,
      ano_origem: (passageiro as any).ano_letivo || 2026,
      ano_destino: dto.ano_destino,
      status: dto.status ?? (existente?.status || RenovacaoStatus.PENDENTE),
      novo_valor_cobranca: dto.novo_valor_cobranca !== undefined ? dto.novo_valor_cobranca : (existente?.novo_valor_cobranca ?? passageiro.valor_cobranca),
      novo_dia_vencimento: dto.novo_dia_vencimento !== undefined ? dto.novo_dia_vencimento : (existente?.novo_dia_vencimento ?? passageiro.dia_vencimento),
      nova_escola_id: dto.nova_escola_id !== undefined ? dto.nova_escola_id : (existente?.nova_escola_id ?? passageiro.escola_id),
      novo_periodo: dto.novo_periodo !== undefined ? dto.novo_periodo : (existente?.novo_periodo ?? passageiro.periodo),
      nova_modalidade: dto.nova_modalidade !== undefined ? dto.nova_modalidade : (existente?.nova_modalidade ?? passageiro.modalidade),
      nova_turma: dto.nova_turma !== undefined ? dto.nova_turma : (existente?.nova_turma ?? passageiro.turma),
      novo_nome_professor: dto.novo_nome_professor !== undefined ? dto.novo_nome_professor : (existente?.novo_nome_professor ?? passageiro.nome_professor),
      novo_veiculo_id: dto.novo_veiculo_id !== undefined ? dto.novo_veiculo_id : (existente?.novo_veiculo_id ?? passageiro.veiculo_id),
      novo_isento: dto.novo_isento !== undefined ? dto.novo_isento : (existente?.novo_isento ?? passageiro.isento),
      token_publico: existente?.token_publico || crypto.randomBytes(16).toString("hex"),
    };

    if (dto.nova_data_inicio_transporte !== undefined) payload.nova_data_inicio_transporte = dto.nova_data_inicio_transporte ? toPersistenceString(dto.nova_data_inicio_transporte) : null;
    if (dto.nova_data_fim_transporte !== undefined) payload.nova_data_fim_transporte = dto.nova_data_fim_transporte ? toPersistenceString(dto.nova_data_fim_transporte) : null;
    if (dto.nova_data_inicio_cobranca !== undefined) payload.nova_data_inicio_cobranca = dto.nova_data_inicio_cobranca ? toPersistenceString(dto.nova_data_inicio_cobranca) : null;
    if (dto.nova_data_fim_cobranca !== undefined) payload.nova_data_fim_cobranca = dto.nova_data_fim_cobranca ? toPersistenceString(dto.nova_data_fim_cobranca) : null;

    if (dto.status === RenovacaoStatus.CONFIRMADO_MANUAL || dto.status === RenovacaoStatus.CONFIRMADO_ONLINE) {
      payload.confirmado_em = new Date().toISOString();
      payload.motivo_recusa = null;
      payload.justificativa_recusa = null;
      payload.quem_recusou = null;
      payload.recusado_em = null;
    } else if (dto.status === RenovacaoStatus.RECUSADO_MOTORISTA || dto.status === RenovacaoStatus.RECUSADO_PAIS) {
      payload.recusado_em = new Date().toISOString();
      payload.motivo_recusa = dto.motivo_recusa ?? (existente?.motivo_recusa || RenovacaoMotivoRecusa.OUTRO);
      payload.justificativa_recusa = dto.justificativa_recusa !== undefined ? (dto.justificativa_recusa ? cleanString(dto.justificativa_recusa) : null) : (existente?.justificativa_recusa || null);
      payload.quem_recusou = dto.quem_recusou ?? (dto.status === RenovacaoStatus.RECUSADO_MOTORISTA ? "motorista" : "responsavel");
      payload.confirmado_em = null;
      payload.ip_confirmacao = null;
      payload.user_agent_confirmacao = null;
    } else if (dto.status === RenovacaoStatus.PENDENTE) {
      payload.confirmado_em = null;
      payload.recusado_em = null;
      payload.motivo_recusa = null;
      payload.justificativa_recusa = null;
      payload.quem_recusou = null;
      payload.ip_confirmacao = null;
      payload.user_agent_confirmacao = null;
    }

    return renovacaoRepository.upsertReserva(payload);
  },

  async virarAnoLetivo(usuarioId: string, dto: VirarAnoLetivoDTO) {
    const confirmados = await renovacaoRepository.listConfirmadosParaVirada(usuarioId, dto.ano_destino);
    const recusados = await renovacaoRepository.listRecusadosParaVirada(usuarioId, dto.ano_destino);

    for (const item of (confirmados as any[])) {
      const updateData: Record<string, unknown> = {
        ano_letivo: dto.ano_destino,
        valor_cobranca: item.novo_valor_cobranca,
        dia_vencimento: item.novo_dia_vencimento,
        escola_id: item.nova_escola_id,
        periodo: item.novo_periodo,
        modalidade: item.nova_modalidade,
        turma: item.nova_turma,
        nome_professor: item.novo_nome_professor,
        isento: item.novo_isento,
        ativo: true,
      };

      if (item.nova_data_inicio_transporte) updateData.data_inicio_transporte = item.nova_data_inicio_transporte;
      if (item.nova_data_fim_transporte) updateData.data_fim_transporte = item.nova_data_fim_transporte;
      if (item.nova_data_inicio_cobranca) updateData.data_inicio_cobranca = item.nova_data_inicio_cobranca;
      if (item.nova_data_fim_cobranca) updateData.data_fim_cobranca = item.nova_data_fim_cobranca;
      if (item.novo_veiculo_id) updateData.veiculo_id = item.novo_veiculo_id;

      await renovacaoRepository.atualizarPassageiroNaVirada(item.passageiro_id, updateData);
    }

    if (recusados.length > 0) {
      const recusadosIds = (recusados as any[]).map(r => r.passageiro_id);
      await renovacaoRepository.inativarPassageirosNaVirada(recusadosIds);
    }

    await renovacaoRepository.marcarRenovacoesComoConcluidas(usuarioId, dto.ano_destino);

    try {
      await notificationService.sendDirect(
        NotificationChannelEnum.FIREBASE,
        "ano_letivo_virado",
        {
          usuarioId,
          titulo: "✨ Ano Letivo Atualizado!",
          corpo: `O Ano Letivo ${dto.ano_destino} foi iniciado. ${confirmados.length} passageiros foram atualizados com sucesso.`,
        },
        { usuarioId }
      );
    } catch {
      // Silencioso em caso de push
    }

    return {
      promovidos: confirmados.length,
      inativados: recusados.length,
      ano_destino: dto.ano_destino,
    };
  }
};
