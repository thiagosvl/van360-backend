import {
  EVENTO_PASSAGEIRO_ATRASADO,
  EVENTO_PASSAGEIRO_VENCIMENTO_HOJE,
  EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO,
} from "../config/constants.js";
import { AppError } from "../errors/AppError.js";
import { cobrancaRepository } from "../repositories/cobranca.repository.js";
import {
  NotificationQueueItemPayload,
  notificationQueueRepository,
} from "../repositories/notification-queue.repository.js";
import { CobrancaLembreteEnviadoDTO } from "../types/dtos/cobranca.dto.js";
import { CobrancaLembreteTipoEnum } from "../types/enums.js";
import { diffInDays, toPersistenceString } from "../utils/date.utils.js";

const EVENTOS_LEMBRETE_COBRANCA = [
  EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO,
  EVENTO_PASSAGEIRO_VENCIMENTO_HOJE,
  EVENTO_PASSAGEIRO_ATRASADO,
] as const;

function matchesCobranca(
  item: NotificationQueueItemPayload,
  cobrancaId: string,
  mes: number,
  ano: number
): boolean {
  const payload = item.payload || {};
  const metadata = payload.metadata as Record<string, unknown> | undefined;
  const payloadCobrancaId =
    (typeof payload.cobrancaId === "string" ? payload.cobrancaId : undefined) ||
    (typeof metadata?.cobrancaId === "string" ? metadata.cobrancaId : undefined);

  if (payloadCobrancaId === cobrancaId) {
    return true;
  }

  const payloadMes = Number(payload.mes);
  const payloadAno = Number(payload.ano);
  if (!Number.isNaN(payloadMes) && !Number.isNaN(payloadAno)) {
    return payloadMes === mes && payloadAno === ano;
  }

  return false;
}

function mapQueueItemToDTO(
  item: NotificationQueueItemPayload,
  dataVencimento: string
): CobrancaLembreteEnviadoDTO {
  const payload = item.payload || {};
  const metadata = payload.metadata as Record<string, unknown> | undefined;
  const options = payload.options as Record<string, unknown> | undefined;
  const optionsMetadata = options?.metadata as Record<string, unknown> | undefined;

  const isIsencao =
    payload.isencaoEncargos === true ||
    metadata?.isencaoEncargos === true ||
    optionsMetadata?.isencaoEncargos === true;

  const enviadoEm = item.created_at || item.updated_at || new Date().toISOString();
  const dataEnvioStr = toPersistenceString(enviadoEm);
  const dataVencPayload =
    typeof payload.dataVencimento === "string" && payload.dataVencimento
      ? payload.dataVencimento
      : dataVencimento;

  if (isIsencao) {
    return {
      id: item.id || `${enviadoEm}_isencao`,
      evento: item.evento,
      tipo: CobrancaLembreteTipoEnum.ISENCAO_ENCARGOS,
      dias_referencia: null,
      destinatario: item.destinatario || null,
      enviado_em: enviadoEm,
    };
  }

  if (item.evento === EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO) {
    const rawDias = Number(payload.diasAntecedencia);
    const dias =
      !Number.isNaN(rawDias) && rawDias > 0
        ? rawDias
        : Math.max(1, diffInDays(dataEnvioStr, dataVencPayload));

    return {
      id: item.id || `${enviadoEm}_antecipado`,
      evento: item.evento,
      tipo: CobrancaLembreteTipoEnum.ANTECIPADO,
      dias_referencia: dias,
      destinatario: item.destinatario || null,
      enviado_em: enviadoEm,
    };
  }

  if (item.evento === EVENTO_PASSAGEIRO_ATRASADO) {
    const rawDias = Number(payload.diasAtraso);
    const dias =
      !Number.isNaN(rawDias) && rawDias > 0
        ? rawDias
        : Math.max(1, diffInDays(dataVencPayload, dataEnvioStr));

    return {
      id: item.id || `${enviadoEm}_atraso`,
      evento: item.evento,
      tipo: CobrancaLembreteTipoEnum.ATRASO,
      dias_referencia: dias,
      destinatario: item.destinatario || null,
      enviado_em: enviadoEm,
    };
  }

  return {
    id: item.id || `${enviadoEm}_hoje`,
    evento: item.evento,
    tipo: CobrancaLembreteTipoEnum.VENCIMENTO_HOJE,
    dias_referencia: 0,
    destinatario: item.destinatario || null,
    enviado_em: enviadoEm,
  };
}

function buildFallbackFromUltimaNotificacao(
  cobrancaId: string,
  dataEnvioUltimaNotificacao: string,
  dataVencimento: string
): CobrancaLembreteEnviadoDTO {
  const envioStr = toPersistenceString(dataEnvioUltimaNotificacao);
  const vencStr = toPersistenceString(dataVencimento);

  if (envioStr < vencStr) {
    const diasAntecedencia = Math.max(1, diffInDays(envioStr, vencStr));
    return {
      id: `fallback_${cobrancaId}`,
      evento: EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO,
      tipo: CobrancaLembreteTipoEnum.ANTECIPADO,
      dias_referencia: diasAntecedencia,
      destinatario: null,
      enviado_em: `${envioStr}T08:00:00.000-03:00`,
    };
  }

  if (envioStr > vencStr) {
    const diasAtraso = Math.max(1, diffInDays(vencStr, envioStr));
    return {
      id: `fallback_${cobrancaId}`,
      evento: EVENTO_PASSAGEIRO_ATRASADO,
      tipo: CobrancaLembreteTipoEnum.ATRASO,
      dias_referencia: diasAtraso,
      destinatario: null,
      enviado_em: `${envioStr}T08:00:00.000-03:00`,
    };
  }

  return {
    id: `fallback_${cobrancaId}`,
    evento: EVENTO_PASSAGEIRO_VENCIMENTO_HOJE,
    tipo: CobrancaLembreteTipoEnum.VENCIMENTO_HOJE,
    dias_referencia: 0,
    destinatario: null,
    enviado_em: `${envioStr}T08:00:00.000-03:00`,
  };
}

export const cobrancaLembretesService = {
  async listarLembretesEnviados(
    cobrancaId: string,
    usuarioId?: string
  ): Promise<CobrancaLembreteEnviadoDTO[]> {
    const { data: cobranca, error } = await cobrancaRepository.getByIdBasic(
      cobrancaId,
      usuarioId
    );

    if (error || !cobranca) {
      throw new AppError("Cobrança não encontrada.", 404);
    }

    const items = await notificationQueueRepository.findSentWabaByPassageiroEvents(
      cobranca.passageiro_id,
      EVENTOS_LEMBRETE_COBRANCA
    );

    const matched = items
      .filter((item) =>
        matchesCobranca(item, cobranca.id, cobranca.mes, cobranca.ano)
      )
      .map((item) => mapQueueItemToDTO(item, cobranca.data_vencimento));

    if (matched.length > 0) {
      return matched;
    }

    if (cobranca.data_envio_ultima_notificacao) {
      return [
        buildFallbackFromUltimaNotificacao(
          cobranca.id,
          cobranca.data_envio_ultima_notificacao,
          cobranca.data_vencimento
        ),
      ];
    }

    return [];
  },
};
