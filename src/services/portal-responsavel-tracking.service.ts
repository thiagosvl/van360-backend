import { AppError } from "../errors/AppError.js";
import { supabaseAdmin } from "../config/supabase.js";
import { portalResponsavelService } from "./portal-responsavel.service.js";
import { RouteExecutionStatus, RouteStopStatus, TipoResponsavel, RouteSentido, RouteNodeType } from "../types/enums.js";
import { ENABLE_LIVE_TRACKING } from "../config/constants.js";

export interface TrackingResponseDTO {
  ativa: boolean;
  execucao: {
    id: string;
    rota_id: string;
    rota_nome: string;
    iniciada_em: string;
    status: RouteExecutionStatus;
    rastreamento_ativo: boolean;
    rastreamento_modo: string;
    is_liberado_gps: boolean;
    parada_aluno: {
      id: string;
      ordem: number;
      status: RouteStopStatus;
      sentido: RouteSentido | null;
      notificado_em: string | null;
      visitado_em: string | null;
    };
    destino: {
      endereco: string;
      tipo: RouteNodeType;
    };
    casa: {
      endereco: string;
    };
    escola: {
      id: string;
      nome: string;
      endereco: string;
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
    if (!ENABLE_LIVE_TRACKING) {
      return {
        ativa: false,
        execucao: null
      };
    }

    const payload = await portalResponsavelService.verifyResponsavelToken(token);

    if (!payload.passageiro_ids.includes(passageiroId)) {
      throw new AppError("Acesso não autorizado para este aluno.", 403);
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
          notificar_pais,
          rastreamento_ativo,
          rastreamento_modo,
          rota:rotas (
            id,
            nome
          )
        ),
        passageiro:passageiros (
          id,
          nome,
          escola:escolas (
            id,
            nome,
            logradouro,
            numero,
            bairro,
            cidade
          ),
          responsaveis_links:passageiro_responsaveis (
            tipo,
            responsavel:responsaveis (
              logradouro,
              numero,
              bairro,
              cidade
            )
          )
        )
      `)
      .eq("passageiro_id", passageiroId)
      .eq("execucao.status", RouteExecutionStatus.INICIADA)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paradaError) {
      throw new AppError(`Erro ao buscar rastreamento do aluno: ${paradaError.message}`, 500);
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

    const passageiro = Array.isArray(paradaAtiva.passageiro)
      ? paradaAtiva.passageiro[0]
      : paradaAtiva.passageiro;

    if (
      !execucao ||
      execucao.status !== RouteExecutionStatus.INICIADA ||
      execucao.notificar_pais === false
    ) {
      return {
        ativa: false,
        execucao: null
      };
    }

    const rota = Array.isArray(execucao.rota) ? execucao.rota[0] : execucao.rota;

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
        p.status === RouteStopStatus.DESEMBARCADO ||
        p.status === RouteStopStatus.AUSENTE
    ).length;

    const paradasRestantes = paradas.filter(
      p => p.status === RouteStopStatus.PENDENTE && p.ordem < paradaAtiva.ordem
    ).length;

    const links = (passageiro?.responsaveis_links as Array<{ tipo: string; responsavel: { logradouro?: string; numero?: string; bairro?: string; cidade?: string } | Array<{ logradouro?: string; numero?: string; bairro?: string; cidade?: string }> }>) || [];
    const principalLink = links.find(l => l.tipo === TipoResponsavel.PRINCIPAL) || links[0];
    const rawResp = principalLink?.responsavel;
    const resp = Array.isArray(rawResp) ? rawResp[0] : rawResp;

    const enderecoFormatado = resp
      ? [resp.logradouro, resp.numero, resp.bairro, resp.cidade]
          .filter(Boolean)
          .join(", ")
      : "Endereço cadastrado";

    const escola = passageiro?.escola
      ? Array.isArray(passageiro.escola)
        ? passageiro.escola[0]
        : passageiro.escola
      : null;

    const enderecoEscola = escola
      ? [escola.logradouro, escola.numero, escola.bairro, escola.cidade]
          .filter(Boolean)
          .join(", ") || escola.nome || "Escola"
      : "Escola";

    const alunoJaEmbarcou =
      paradaAtiva.status === RouteStopStatus.EMBARCADO ||
      paradaAtiva.status === RouteStopStatus.DESEMBARCADO;

    const vaiParaEscola =
      paradaAtiva.sentido === RouteSentido.INDO && alunoJaEmbarcou;

    const destEndereco = vaiParaEscola ? enderecoEscola : enderecoFormatado;
    const destTipo = vaiParaEscola ? RouteNodeType.ESCOLA : RouteNodeType.PASSAGEIRO;

    const rastreamentoAtivo = (execucao as any).rastreamento_ativo !== false;
    const rastreamentoModo = (execucao as any).rastreamento_modo || "completo";

    let isLiberadoGps = false;
    if (rastreamentoAtivo) {
      if (rastreamentoModo === "completo") {
        isLiberadoGps = true;
      } else {
        if (paradaAtiva.status === RouteStopStatus.PENDENTE && paradasRestantes === 0) {
          isLiberadoGps = true;
        } else if (paradaAtiva.status === RouteStopStatus.EMBARCADO && paradaAtiva.sentido === RouteSentido.INDO) {
          isLiberadoGps = true;
        }
      }
    }

    return {
      ativa: true,
      execucao: {
        id: execucao.id,
        rota_id: execucao.rota_id,
        rota_nome: rota?.nome || "Rota Escolar",
        iniciada_em: execucao.iniciada_em,
        status: execucao.status as RouteExecutionStatus,
        rastreamento_ativo: rastreamentoAtivo,
        rastreamento_modo: rastreamentoModo,
        is_liberado_gps: isLiberadoGps,
        parada_aluno: {
          id: paradaAtiva.id,
          ordem: paradaAtiva.ordem,
          status: paradaAtiva.status as RouteStopStatus,
          sentido: paradaAtiva.sentido,
          notificado_em: paradaAtiva.notificado_em,
          visitado_em: paradaAtiva.visitado_em
        },
        destino: {
          endereco: destEndereco || "Endereço cadastrado",
          tipo: destTipo
        },
        casa: {
          endereco: enderecoFormatado
        },
        escola: escola
          ? {
              id: escola.id,
              nome: escola.nome,
              endereco: enderecoEscola
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
