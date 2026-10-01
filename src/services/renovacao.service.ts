import crypto from "node:crypto";
import { supabaseAdmin } from "../config/supabase.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { renovacaoRepository, type PassageiroComRenovacaoItem, type PublicPropostaQueryResult } from "../repositories/renovacao.repository.js";
import { passageiroRepository } from "../repositories/passageiro.repository.js";
import { contractRepository } from "../repositories/contract.repository.js";
import { AppError } from "../errors/AppError.js";
import {
  ListRenovacoesQueryDTO,
  ReajusteLoteDTO,
  UpdateRenovacaoDTO,
  VirarAnoLetivoDTO,
  AtualizarStatusLoteDTO,
  AtualizarDadosPublicosDTO,
} from "../types/dtos/renovacao.dto.js";
import {
  NotificationChannelEnum,
  RenovacaoReajusteTipo,
  RenovacaoStatus,
  TipoResponsavel,
  ContratoProvider,
} from "../types/enums.js";
import { toPersistenceString } from "../utils/date.utils.js";
import { cleanString } from "../utils/string.utils.js";
import { notificationService } from "./notifications/notification.service.js";

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

      if (statusReserva === RenovacaoStatus.CONFIRMADO) {
        countConfirmados++;
        faturamentoProjetado += novoValor;
      } else if (statusReserva === RenovacaoStatus.RECUSADO) {
        countSaidas++;
      } else {
        countPendentes++;
        faturamentoProjetado += novoValor;
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
        nome_professor_atual: pEnriched.nome_professor,
        veiculo_id_atual: pEnriched.veiculo_id || null,
        isento_atual: pEnriched.isento,
        data_inicio_transporte_atual: pEnriched.data_inicio_transporte || null,
        data_fim_transporte_atual: pEnriched.data_fim_transporte || null,
        data_inicio_cobranca_atual: pEnriched.data_inicio_cobranca || null,
        data_fim_cobranca_atual: pEnriched.data_fim_cobranca || null,
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
        novo_veiculo_id: renovacao?.novo_veiculo_id ?? pEnriched.veiculo_id ?? null,
        nova_data_inicio_transporte: renovacao?.nova_data_inicio_transporte || null,
        nova_data_fim_transporte: renovacao?.nova_data_fim_transporte || null,
        nova_data_inicio_cobranca: renovacao?.nova_data_inicio_cobranca || null,
        nova_data_fim_cobranca: renovacao?.nova_data_fim_cobranca || null,
        notificacao_enviada_em: notificacaoEnviadaEm,
        token_publico: tokenPublico,
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

    for (const { passageiro, renovacao } of itens) {
      if (dto.escola_ids && dto.escola_ids.length > 0) {
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
        ano_origem: passageiro.ano_letivo || 2026,
        ano_destino: dto.ano_destino,
        status: renovacao?.status || RenovacaoStatus.PENDENTE,
        novo_valor_cobranca: isPassageiroIsento ? 0 : novoValor,
        novo_dia_vencimento: isPassageiroIsento ? null : (renovacao?.novo_dia_vencimento ?? passageiro.dia_vencimento),
        nova_escola_id: renovacao?.nova_escola_id ?? passageiro.escola_id,
        novo_periodo: renovacao?.novo_periodo ?? passageiro.periodo,
        nova_modalidade: renovacao?.nova_modalidade ?? passageiro.modalidade,
        nova_turma: renovacao?.nova_turma ?? passageiro.turma,
        novo_nome_professor: renovacao?.novo_nome_professor ?? passageiro.nome_professor,
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
    }

    return renovacaoRepository.upsertLote(updates);
  },

  async atualizarStatusLote(usuarioId: string, dto: AtualizarStatusLoteDTO) {
    const itens = await renovacaoRepository.listPassageirosComRenovacao(usuarioId, dto.ano_destino);
    const targetItens = itens.filter(i => dto.passageiro_ids.includes(i.passageiro.id));

    const now = new Date().toISOString();
    const updates: Record<string, unknown>[] = [];

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
    }

    const result = await renovacaoRepository.upsertLote(updates);

    if (dto.status === RenovacaoStatus.CONFIRMADO) {
      try {
        const { userRepository } = await import("../repositories/user.repository.js");
        const { data: usuario } = await userRepository.getProfileData(usuarioId);
        if (usuario?.config_contrato?.usar_contratos) {
          const { contractService } = await import("./contract.service.js");
          for (const item of targetItens) {
            const contratoExistente = await contractRepository.getByPassageiroEAno(item.passageiro.id, dto.ano_destino);
            if (!contratoExistente) {
              await contractService.criarContrato(usuarioId, {
                passageiroId: item.passageiro.id,
                provider: ContratoProvider.INHOUSE,
                ano: dto.ano_destino,
                valorMensal: Number(item.renovacao?.novo_valor_cobranca ?? item.passageiro.valor_cobranca ?? 0),
                diaVencimento: Number(item.renovacao?.novo_dia_vencimento ?? item.passageiro.dia_vencimento ?? 10),
                dataInicio: item.renovacao?.nova_data_inicio_transporte ? String(item.renovacao.nova_data_inicio_transporte) : undefined,
                dataFim: item.renovacao?.nova_data_fim_transporte ? String(item.renovacao.nova_data_fim_transporte) : undefined,
                notificarResponsavel: false,
              });
            }
          }
        }
      } catch (err: unknown) {
        logger.error({ error: err }, "Falha ao gerar contratos em lote para renovações confirmadas");
      }
    }

    return {
      success: true,
      updated_count: result.length,
    };
  },

  async updateRenovacaoIndividual(usuarioId: string, passageiroId: string, dto: UpdateRenovacaoDTO) {
    const { data: passageiro } = await passageiroRepository.getById(passageiroId, usuarioId);
    if (!passageiro) {
      throw new AppError("Passageiro não encontrado.", 404);
    }

    const isPassageiroIsento = Boolean(passageiro.isento);
    const existente = await renovacaoRepository.getByPassageiroEAno(passageiroId, dto.ano_destino);

    const payload: Record<string, unknown> = {
      usuario_id: usuarioId,
      passageiro_id: passageiroId,
      ano_origem: passageiro.ano_letivo || 2026,
      ano_destino: dto.ano_destino,
      status: dto.status ?? (existente?.status || RenovacaoStatus.PENDENTE),
      novo_valor_cobranca: isPassageiroIsento ? 0 : (dto.novo_valor_cobranca !== undefined ? dto.novo_valor_cobranca : (existente?.novo_valor_cobranca ?? passageiro.valor_cobranca)),
      novo_dia_vencimento: isPassageiroIsento ? null : (dto.novo_dia_vencimento !== undefined ? dto.novo_dia_vencimento : (existente?.novo_dia_vencimento ?? passageiro.dia_vencimento)),
      nova_escola_id: dto.nova_escola_id !== undefined ? dto.nova_escola_id : (existente?.nova_escola_id ?? passageiro.escola_id),
      novo_periodo: dto.novo_periodo !== undefined ? dto.novo_periodo : (existente?.novo_periodo ?? passageiro.periodo),
      nova_modalidade: dto.nova_modalidade !== undefined ? dto.nova_modalidade : (existente?.nova_modalidade ?? passageiro.modalidade),
      nova_turma: dto.nova_turma !== undefined ? dto.nova_turma : (existente?.nova_turma ?? passageiro.turma),
      novo_nome_professor: dto.novo_nome_professor !== undefined ? dto.novo_nome_professor : (existente?.novo_nome_professor ?? passageiro.nome_professor),
      novo_veiculo_id: dto.novo_veiculo_id !== undefined ? dto.novo_veiculo_id : (existente?.novo_veiculo_id ?? passageiro.veiculo_id),
      novo_isento: isPassageiroIsento,
      token_publico: existente?.token_publico || crypto.randomBytes(16).toString("hex"),
    };

    if (dto.nova_data_inicio_transporte !== undefined) payload.nova_data_inicio_transporte = dto.nova_data_inicio_transporte ? toPersistenceString(dto.nova_data_inicio_transporte) : null;
    if (dto.nova_data_fim_transporte !== undefined) payload.nova_data_fim_transporte = dto.nova_data_fim_transporte ? toPersistenceString(dto.nova_data_fim_transporte) : null;
    
    if (!isPassageiroIsento) {
      if (dto.nova_data_inicio_cobranca !== undefined) payload.nova_data_inicio_cobranca = dto.nova_data_inicio_cobranca ? toPersistenceString(dto.nova_data_inicio_cobranca) : null;
      if (dto.nova_data_fim_cobranca !== undefined) payload.nova_data_fim_cobranca = dto.nova_data_fim_cobranca ? toPersistenceString(dto.nova_data_fim_cobranca) : null;
    } else {
      payload.nova_data_inicio_cobranca = null;
      payload.nova_data_fim_cobranca = null;
    }

    if (dto.status === RenovacaoStatus.CONFIRMADO) {
      payload.confirmado_em = new Date().toISOString();
    } else {
      payload.confirmado_em = null;
    }

    const result = await renovacaoRepository.upsertReserva(payload);

    if (dto.status === RenovacaoStatus.CONFIRMADO) {
      try {
        const { userRepository } = await import("../repositories/user.repository.js");
        const { data: usuario } = await userRepository.getProfileData(usuarioId);
        if (usuario?.config_contrato?.usar_contratos) {
          const contratoExistente = await contractRepository.getByPassageiroEAno(passageiroId, dto.ano_destino);
          if (!contratoExistente) {
            const { contractService } = await import("./contract.service.js");
            await contractService.criarContrato(usuarioId, {
              passageiroId,
              provider: ContratoProvider.INHOUSE,
              ano: dto.ano_destino,
              valorMensal: Number(payload.novo_valor_cobranca ?? passageiro.valor_cobranca),
              diaVencimento: Number(payload.novo_dia_vencimento ?? passageiro.dia_vencimento),
              dataInicio: payload.nova_data_inicio_transporte ? String(payload.nova_data_inicio_transporte) : (passageiro.data_inicio_transporte || undefined),
              dataFim: payload.nova_data_fim_transporte ? String(payload.nova_data_fim_transporte) : (passageiro.data_fim_transporte || undefined),
              modalidade: payload.nova_modalidade ? String(payload.nova_modalidade) : (passageiro.modalidade || undefined),
              periodo: payload.novo_periodo ? String(payload.novo_periodo) : (passageiro.periodo || undefined),
              notificarResponsavel: false,
            });
          }
        }
      } catch (contractErr: unknown) {
        logger.warn({ error: contractErr instanceof Error ? contractErr.message : String(contractErr), passageiroId }, "[Renovacao] Não foi possível gerar contrato automático na confirmação individual");
      }
    }

    return result;
  },

  async virarAnoLetivo(usuarioId: string, dto: VirarAnoLetivoDTO) {
    const confirmados = await renovacaoRepository.listConfirmadosParaVirada(usuarioId, dto.ano_destino);
    const recusados = await renovacaoRepository.listRecusadosParaVirada(usuarioId, dto.ano_destino);

    for (const item of confirmados) {
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
      const recusadosIds = recusados.map(r => r.passageiro_id);
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

    let contratoInfo = null;
    if (motorista?.config_contrato?.usar_contratos) {
      const contrato = await contractRepository.getByPassageiroEAno(passageiro.id, data.ano_destino);
      if (contrato) {
        contratoInfo = {
          id: contrato.id,
          status: contrato.status,
          token_acesso: contrato.token_acesso,
        };
      }
    }

    const dtInicioTransp = data.nova_data_inicio_transporte || passageiro.data_inicio_transporte || null;
    const dtFimTransp = data.nova_data_fim_transporte || passageiro.data_fim_transporte || null;
    const dtInicioCobr = data.nova_data_inicio_cobranca || passageiro.data_inicio_cobranca || null;
    const dtFimCobr = data.nova_data_fim_cobranca || passageiro.data_fim_cobranca || null;

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
        // fallback
      }
    }

    return {
      token_publico: data.token_publico,
      status: data.status,
      confirmado_em: data.confirmado_em,
      recusado_em: data.recusado_em,
      ano_origem: data.ano_origem,
      ano_destino: data.ano_destino,
      motorista: {
        id: motorista.id,
        nome: motorista.nome,
        apelido: motorista.apelido,
        telefone: motorista.telefone,
        logo_url: motorista.logo_url,
        usar_contratos: Boolean(motorista.config_contrato?.usar_contratos),
      },
      passageiro: {
        id: passageiro.id,
        nome: passageiro.nome,
        data_nascimento: passageiro.data_nascimento || null,
        turma: data.nova_turma || passageiro.turma || null,
        sala: passageiro.sala || null,
        nome_professor: data.novo_nome_professor || passageiro.nome_professor || null,
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
          atual: escolaAtualNome,
          novo: novaEscolaNome,
          alterado: pEnriched.escola_id !== (data.nova_escola_id ?? pEnriched.escola_id),
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
          novo: data.nova_turma ?? passageiro.turma ?? null,
          alterado: Boolean(data.nova_turma && data.nova_turma !== passageiro.turma),
        },
        nome_professor: {
          atual: passageiro.nome_professor || null,
          novo: data.novo_nome_professor ?? passageiro.nome_professor ?? null,
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

    const { passageiro } = data;
    const pEnriched = _enrichPassageiroResponsavel(passageiro);
    const responsavelId = pEnriched.responsavel_principal?.id || null;

    const dadosResponsavel: Record<string, unknown> = {};
    if (dto.nome_responsavel !== undefined) dadosResponsavel.nome = dto.nome_responsavel;
    if (dto.telefone_responsavel !== undefined) dadosResponsavel.telefone = dto.telefone_responsavel;
    if (dto.cpf_responsavel !== undefined) dadosResponsavel.cpf = dto.cpf_responsavel;
    if (dto.email_responsavel !== undefined) dadosResponsavel.email = dto.email_responsavel;
    if (dto.cep !== undefined) dadosResponsavel.cep = dto.cep;
    if (dto.logradouro !== undefined) dadosResponsavel.logradouro = dto.logradouro;
    if (dto.numero !== undefined) dadosResponsavel.numero = dto.numero;
    if (dto.bairro !== undefined) dadosResponsavel.bairro = dto.bairro;
    if (dto.cidade !== undefined) dadosResponsavel.cidade = dto.cidade;
    if (dto.estado !== undefined) dadosResponsavel.estado = dto.estado;
    if (dto.complemento !== undefined) dadosResponsavel.complemento = dto.complemento;
    if (dto.referencia !== undefined) dadosResponsavel.referencia = dto.referencia;

    const dadosPassageiro: Record<string, unknown> = {};
    if (dto.turma !== undefined) dadosPassageiro.turma = dto.turma;
    if (dto.sala !== undefined) dadosPassageiro.sala = dto.sala;
    if (dto.nome_professor !== undefined) dadosPassageiro.nome_professor = dto.nome_professor;
    if (dto.observacoes !== undefined) dadosPassageiro.observacoes = dto.observacoes;

    const dadosReserva: Record<string, unknown> = {};
    if (dto.turma !== undefined) dadosReserva.nova_turma = dto.turma;
    if (dto.nome_professor !== undefined) dadosReserva.novo_nome_professor = dto.nome_professor;
    if (dto.observacoes_pais !== undefined) dadosReserva.observacoes_pais = dto.observacoes_pais;

    await renovacaoRepository.atualizarDadosPublicos(
      data.id,
      passageiro.id,
      responsavelId,
      dadosResponsavel,
      dadosPassageiro,
      dadosReserva
    );

    return this.getPublicRenovacao(token);
  },

  async responderPublico(token: string, status: "confirmado" | "recusado", observacoesPais?: string | null) {
    const data = await renovacaoRepository.getByToken(token);
    if (!data || !data.passageiro) {
      throw new AppError("Proposta de renovação não encontrada ou expirada.", 404);
    }

    const { passageiro, motorista, nova_escola } = data;
    const pEnriched = _enrichPassageiroResponsavel(passageiro);

    const now = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      status,
      confirmado_em: status === "confirmado" ? now : null,
      recusado_em: status === "recusado" ? now : null,
    };

    if (observacoesPais !== undefined) {
      updatePayload.observacoes_pais = observacoesPais;
    }

    await supabaseAdmin
      .from("passageiro_renovacoes")
      .update(updatePayload)
      .eq("id", data.id);

    let contratoGerado = null;

    if (status === "confirmado" && motorista?.config_contrato?.usar_contratos) {
      try {
        const contratoExistente = await contractRepository.getByPassageiroEAno(passageiro.id, data.ano_destino);
        if (!contratoExistente) {
          const { contractService } = await import("./contract.service.js");
          const contrato = await contractService.criarContrato(motorista.id, {
            passageiroId: passageiro.id,
            provider: ContratoProvider.INHOUSE,
            ano: data.ano_destino,
            valorMensal: Number(data.novo_valor_cobranca ?? passageiro.valor_cobranca),
            diaVencimento: Number(data.novo_dia_vencimento ?? passageiro.dia_vencimento),
            dataInicio: data.nova_data_inicio_transporte ? String(data.nova_data_inicio_transporte) : (passageiro.data_inicio_transporte || undefined),
            dataFim: data.nova_data_fim_transporte ? String(data.nova_data_fim_transporte) : (passageiro.data_fim_transporte || undefined),
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

    try {
      const respNome = pEnriched.responsavel_principal?.nome || "Responsável";
      const passNome = passageiro.nome;
      const acaoTitulo = status === "confirmado" ? "🎉 Renovação Confirmada!" : "⚠️ Saída Registrada";
      const acaoCorpo = status === "confirmado"
        ? `${respNome} confirmou a vaga de ${passNome} para o ano letivo de ${data.ano_destino}.`
        : `${respNome} informou que não irá renovar o transporte de ${passNome} para ${data.ano_destino}.`;

      await notificationService.sendDirect(
        NotificationChannelEnum.FIREBASE,
        "renovacao_resposta_recebida",
        {
          usuarioId: motorista.id,
          titulo: acaoTitulo,
          corpo: acaoCorpo,
        },
        { usuarioId: motorista.id }
      );
    } catch {
      // Silencioso se falhar push
    }

    return {
      status,
      ano_destino: data.ano_destino,
      contrato: contratoGerado,
    };
  },

  async notificarPassageiro(usuarioId: string, passageiroId: string, anoDestino: number) {
    const passageiro = await passageiroRepository.getByIdCompleto(passageiroId, usuarioId);
    if (!passageiro) {
      throw new AppError("Passageiro não encontrado.", 404);
    }

    const pEnriched = _enrichPassageiroResponsavel(passageiro);
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
        ano_origem: passageiro.ano_letivo || (anoDestino - 1),
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
      await supabaseAdmin
        .from("passageiro_renovacoes")
        .update({ token_publico: tokenPublico })
        .eq("id", renovacao.id);
    }

    const { userRepository } = await import("../repositories/user.repository.js");
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
    await supabaseAdmin
      .from("passageiro_renovacoes")
      .update({ notificacao_enviada_em: now })
      .eq("id", renovacao.id);

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

