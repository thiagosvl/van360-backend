import { AppError } from "../errors/AppError.js";
import { supabaseAdmin } from "../config/supabase.js";
import { portalResponsavelService } from "./portal-responsavel.service.js";
import { RouteExecutionStatus, RouteStopStatus } from "../types/enums.js";
import { FEATURE_FLAGS } from "../config/constants.js";

export interface TrackingResponseDTO {
  ativa: boolean;
  execucao: {
    id: string;
    rota_id: string;
    rota_nome: string;
    iniciada_em: string;
    status: RouteExecutionStatus;
    parada_aluno: {
      id: string;
      ordem: number;
      status: RouteStopStatus;
      sentido: string | null;
      notificado_em: string | null;
      visitado_em: string | null;
    };
    destino: {
      latitude: number | null;
      longitude: number | null;
      endereco: string;
      tipo: "residencia" | "escola";
    };
    escola: {
      id: string;
      nome: string;
    } | null;
    fila: {
      paradas_restantes: number;
      total_paradas: number;
      paradas_concluidas: number;
    };
  } | null;
}

export const portalResponsavelTrackingService = {
  async getRastreamentoPassageiro(token: string, passageiroId: string): Promise<TrackingResponseDTO> {
    if (!FEATURE_FLAGS.ENABLE_LIVE_TRACKING) {
      return {
        ativa: false,
        execucao: null
      };
    }

    const payload = await portalResponsavelService.verifyResponsavelToken(token);

    if (!payload.passageiro_ids.includes(passageiroId)) {
      throw new AppError("Acesso não autorizado para este passageiro.", 403);
    }

    const { data: paradaAtiva, error: paradaError } = await supabaseAdmin
      .from("execucoes_rota_passageiros")
      .select(`
        id,
        ordem,
        status,
        sentido,
        notificado_em,
        visitado_em,
        execucao_rota_id,
        execucao:execucoes_rota!execucao_rota_id (
          id,
          rota_id,
          status,
          iniciada_em,
          rota:rotas (
            id,
            nome
          )
        ),
        passageiro:passageiros (
          id,
          nome,
          latitude,
          longitude,
          logradouro,
          numero,
          bairro,
          cidade,
          escola:escolas (
            id,
            nome
          )
        )
      `)
      .eq("passageiro_id", passageiroId)
      .eq("execucao.status", RouteExecutionStatus.INICIADA)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paradaError) {
      throw new AppError(`Erro ao buscar rastreamento: ${paradaError.message}`, 500);
    }

    if (!paradaAtiva || !paradaAtiva.execucao) {
      return {
        ativa: false,
        execucao: null
      };
    }

    const execucao = Array.isArray(paradaAtiva.execucao)
      ? paradaAtiva.execucao[0]
      : paradaAtiva.execucao;

    if (!execucao || execucao.status !== RouteExecutionStatus.INICIADA) {
      return {
        ativa: false,
        execucao: null
      };
    }

    const rota = Array.isArray(execucao.rota) ? execucao.rota[0] : execucao.rota;
    const passageiro = Array.isArray(paradaAtiva.passageiro)
      ? paradaAtiva.passageiro[0]
      : paradaAtiva.passageiro;

    const { data: todasParadas, error: todasParadasError } = await supabaseAdmin
      .from("execucoes_rota_passageiros")
      .select("id, ordem, status, passageiro_id")
      .eq("execucao_rota_id", execucao.id)
      .order("ordem", { ascending: true });

    if (todasParadasError) {
      throw new AppError(`Erro ao listar paradas da execução: ${todasParadasError.message}`, 500);
    }

    const paradas = todasParadas || [];
    const totalParadas = paradas.length;
    const paradasConcluidas = paradas.filter(
      p =>
        p.status === RouteStopStatus.EMBARCADO ||
        p.status === "desembarcado" ||
        p.status === RouteStopStatus.AUSENTE
    ).length;

    const paradasRestantes = paradas.filter(
      p => p.status === RouteStopStatus.PENDENTE && p.ordem < paradaAtiva.ordem
    ).length;

    const enderecoFormatado = passageiro
      ? [passageiro.logradouro, passageiro.numero, passageiro.bairro, passageiro.cidade]
          .filter(Boolean)
          .join(", ")
      : "";

    const escola = passageiro?.escola
      ? Array.isArray(passageiro.escola)
        ? passageiro.escola[0]
        : passageiro.escola
      : null;

    return {
      ativa: true,
      execucao: {
        id: execucao.id,
        rota_id: execucao.rota_id,
        rota_nome: rota?.nome || "Rota Escolar",
        iniciada_em: execucao.iniciada_em,
        status: execucao.status as RouteExecutionStatus,
        parada_aluno: {
          id: paradaAtiva.id,
          ordem: paradaAtiva.ordem,
          status: paradaAtiva.status as RouteStopStatus,
          sentido: paradaAtiva.sentido,
          notificado_em: paradaAtiva.notificado_em,
          visitado_em: paradaAtiva.visitado_em
        },
        destino: {
          latitude: passageiro?.latitude ? Number(passageiro.latitude) : null,
          longitude: passageiro?.longitude ? Number(passageiro.longitude) : null,
          endereco: enderecoFormatado || "Endereço cadastrado",
          tipo: "residencia"
        },
        escola: escola
          ? {
              id: escola.id,
              nome: escola.nome
            }
          : null,
        fila: {
          paradas_restantes: paradasRestantes,
          total_paradas: totalParadas,
          paradas_concluidas: paradasConcluidas
        }
      }
    };
  }
};
