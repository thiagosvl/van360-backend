import { logger } from "../../config/logger.js";
import { getFirebaseAdmin } from "../../config/firebase.js";
import { env } from "../../config/env.js";
import { usuarioPushTokenRepository } from "../../repositories/usuario-push-token.repository.js";
import { adminBroadcastRepository } from "../../repositories/admin/admin-broadcast.repository.js";
import { AppError } from "../../errors/AppError.js";
import { PushNotificationAction } from "../../types/enums.js";
import type { AdminBroadcastSendDTO } from "../../schemas/admin-broadcast.schema.js";
import type {
  AdminBroadcastEstimateResponseDTO,
  AdminBroadcastSendResponseDTO,
} from "../../types/dtos/admin-broadcast.dto.js";

const FCM_CHUNK_SIZE = 500;

export const adminBroadcastService = {
  async estimateReach(params: {
    statusList?: string[];
    driverIds?: string[];
  }): Promise<AdminBroadcastEstimateResponseDTO> {
    const drivers = await adminBroadcastRepository.getEligibleDrivers(params);

    let comPushToken = 0;
    let semPushToken = 0;
    const detalhesPorStatus: Record<string, number> = {};

    for (const d of drivers) {
      detalhesPorStatus[d.statusAssinatura] = (detalhesPorStatus[d.statusAssinatura] || 0) + 1;

      if (d.tokens && d.tokens.length > 0) {
        comPushToken++;
      } else {
        semPushToken++;
      }
    }

    return {
      totalMotoristas: drivers.length,
      comPushToken,
      semPushToken,
      detalhesPorStatus,
    };
  },

  async sendBroadcast(data: AdminBroadcastSendDTO): Promise<AdminBroadcastSendResponseDTO> {
    const drivers = await adminBroadcastRepository.getEligibleDrivers({
      statusList: data.status,
      driverIds: data.motoristaIds,
    });

    if (drivers.length === 0) {
      throw new AppError("Nenhum motorista encontrado para os critérios selecionados.", 400);
    }

    const driversWithTokens = drivers.filter((d) => d.tokens && d.tokens.length > 0);

    if (driversWithTokens.length === 0) {
      return {
        totalDestinatarios: drivers.length,
        totalEnviados: 0,
        totalFalhas: 0,
      };
    }

    const tokenMap = new Map<string, { userId: string; nome: string }>();
    const allTokens: string[] = [];

    for (const d of driversWithTokens) {
      for (const token of d.tokens) {
        if (!tokenMap.has(token)) {
          tokenMap.set(token, { userId: d.id, nome: d.nome });
          allTokens.push(token);
        }
      }
    }

    const admin = getFirebaseAdmin();
    const isDev = env.NODE_ENV !== "production";
    const formattedTitle: string = isDev ? `[DEV] ${data.titulo}` : data.titulo;
    const action: string = data.action || PushNotificationAction.OPEN_HOME;

    let totalEnviados = 0;
    let totalFalhas = 0;
    const failedTokens: string[] = [];
    const queueLogs: Array<{
      usuario_id: string;
      destinatario: string;
      status: string;
      payload: Record<string, unknown>;
      erro_mensagem?: string | null;
      provider_message_id?: string | null;
    }> = [];

    for (let i = 0; i < allTokens.length; i += FCM_CHUNK_SIZE) {
      const chunk = allTokens.slice(i, i + FCM_CHUNK_SIZE);

      const message = {
        tokens: chunk,
        notification: {
          title: formattedTitle,
          body: data.mensagem,
        },
        data: {
          title: formattedTitle,
          body: data.mensagem,
          action,
        },
        android: {
          priority: "high" as const,
          ttl: 86400,
          notification: {
            title: formattedTitle,
            body: data.mensagem,
            channelId: "default",
            sound: "default",
            priority: "high" as const,
          },
        },
        apns: {
          headers: {
            "apns-priority": "10",
          },
          payload: {
            aps: {
              alert: {
                title: formattedTitle,
                body: data.mensagem,
              },
              sound: "default",
              badge: 1,
            },
          },
        },
      };

      try {
        const response = await admin.messaging().sendEachForMulticast(message);
        totalEnviados += response.successCount;
        totalFalhas += response.failureCount;

        response.responses.forEach((resp, idx) => {
          const currentToken = chunk[idx];
          const driverInfo = tokenMap.get(currentToken);
          const userId = driverInfo?.userId || "";

          if (resp.success) {
            queueLogs.push({
              usuario_id: userId,
              destinatario: currentToken,
              status: "SENT",
              provider_message_id: resp.messageId || null,
              payload: {
                titulo: data.titulo,
                mensagem: data.mensagem,
                action,
              },
            });
          } else {
            failedTokens.push(currentToken);
            queueLogs.push({
              usuario_id: userId,
              destinatario: currentToken,
              status: "FAILED",
              erro_mensagem: resp.error?.message || "Falha no envio FCM",
              payload: {
                titulo: data.titulo,
                mensagem: data.mensagem,
                action,
              },
            });
          }
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Erro no envio do chunk FCM";
        logger.error({ err }, "[AdminBroadcastService] Erro ao disparar chunk FCM");
        totalFalhas += chunk.length;

        chunk.forEach((currentToken) => {
          const driverInfo = tokenMap.get(currentToken);
          queueLogs.push({
            usuario_id: driverInfo?.userId || "",
            destinatario: currentToken,
            status: "FAILED",
            erro_mensagem: errorMsg,
            payload: {
              titulo: data.titulo,
              mensagem: data.mensagem,
              action,
            },
          });
        });
      }
    }

    if (failedTokens.length > 0) {
      void usuarioPushTokenRepository.deleteByTokens(failedTokens).catch((err) => {
        logger.warn({ err }, "[AdminBroadcastService] Falha ao expurgar tokens inválidos");
      });
    }

    if (queueLogs.length > 0) {
      void adminBroadcastRepository.logNotificationsInQueue(queueLogs).catch((err) => {
        logger.warn({ err }, "[AdminBroadcastService] Falha ao registrar logs unitários na fila");
      });
    }

    logger.info(
      { totalDestinatarios: drivers.length, totalEnviados, totalFalhas },
      "[AdminBroadcastService] Disparo finalizado com sucesso"
    );

    return {
      totalDestinatarios: drivers.length,
      totalEnviados,
      totalFalhas,
    };
  },
};
