import { logger } from "../../../../config/logger.js";
import { getFirebaseAdmin } from "../../../../config/firebase.js";
import { usuarioPushTokenRepository } from "../../../../repositories/usuario-push-token.repository.js";
import { NotificationProviderPort, NotificationSendResult } from "../../ports/notification-provider.port.js";
import { FirebaseMapper } from "./firebase.mapper.js";
import { env } from "../../../../config/env.js";
import { onlyDigits } from "../../../../utils/string.utils.js";

import { NotificationOptions } from "../../notification.service.js";

export class FirebasePushAdapter implements NotificationProviderPort {
    async send(eventName: string, contextData: Record<string, unknown>, options?: NotificationOptions): Promise<NotificationSendResult> {
        try {
            const to = (contextData.to as string) || "";
            const isPassengerEvent = eventName.startsWith("PASSAGEIRO_") || eventName.startsWith("ROTA_");

            let targetUserId: string | undefined = undefined;

            if (isPassengerEvent && to) {
                const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(to);
                if (isUUID) {
                    targetUserId = to;
                } else {
                    const user = await usuarioPushTokenRepository.findUsuarioByTelefoneOrEmail(to);
                    targetUserId = user ? user.id : onlyDigits(to);
                }
            } else {
                targetUserId = (contextData.usuarioId as string) || options?.usuarioId;
                if (!targetUserId && to) {
                    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(to);
                    if (isUUID) {
                        targetUserId = to;
                    } else {
                        const user = await usuarioPushTokenRepository.findUsuarioByTelefoneOrEmail(to);
                        targetUserId = user ? user.id : onlyDigits(to);
                    }
                }
            }


            if (!targetUserId) {
                const err = "[FirebasePushAdapter] Não foi possível resolver o usuario_id para enviar o push.";
                logger.warn({ to, eventName }, err);
                return { success: false, error: err };
            }

            const payload = FirebaseMapper.getTemplate(eventName, contextData);
            if (!payload) {
                const err = `[FirebasePushAdapter] Template de push não encontrado para o evento '${eventName}'.`;
                return { success: false, error: err };
            }

            const tokenStrings = await usuarioPushTokenRepository.findTokensByUsuarioId(targetUserId);
            if (tokenStrings.length === 0) {
                logger.info({ targetUserId, eventName }, "[FirebasePushAdapter] Usuário não possui tokens de push registrados.");
                return { success: true };
            }

            const admin = getFirebaseAdmin();
            const isDev = env.NODE_ENV !== 'production';
            const title = isDev ? `[DEV] ${payload.title}` : payload.title;

            const message = {
                tokens: tokenStrings,
                notification: {
                    title,
                    body: payload.body
                },
                data: payload.data,
                android: {
                    priority: "high" as const,
                    notification: {
                        title,
                        body: payload.body,
                        channelId: "default",
                        sound: "default",
                        priority: "high" as const,
                    }
                },
                apns: {
                    payload: {
                        aps: {
                            alert: {
                                title,
                                body: payload.body
                            },
                            sound: "default",
                            badge: 1
                        }
                    }
                }
            };

            const response = await admin.messaging().sendEachForMulticast(message);

            logger.info({
                targetUserId,
                eventName,
                successCount: response.successCount,
                failureCount: response.failureCount
            }, "[FirebasePushAdapter] Notificação Push disparada");

            if (response.failureCount > 0) {
                const failedTokens: string[] = [];
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        failedTokens.push(tokenStrings[idx]);
                    }
                });

                if (failedTokens.length > 0) {
                    await usuarioPushTokenRepository.deleteByTokens(failedTokens);
                    logger.info({ failedTokens }, "[FirebasePushAdapter] Tokens falhos removidos do banco.");
                }
            }

            return { success: true };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Erro desconhecido";
            logger.error({ error: message, eventName }, "[FirebasePushAdapter] Falha ao enviar notificação Push");
            return { success: false, error: message };
        }
    }
}

