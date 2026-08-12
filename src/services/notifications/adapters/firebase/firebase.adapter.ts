import { logger } from "../../../../config/logger.js";
import { getFirebaseAdmin } from "../../../../config/firebase.js";
import { usuarioPushTokenRepository } from "../../../../repositories/usuario-push-token.repository.js";
import { NotificationProviderPort } from "../../ports/notification-provider.port.js";
import { FirebaseMapper } from "./firebase.mapper.js";
import { env } from "../../../../config/env.js";

import { NotificationOptions } from "../../notification.service.js";

export class FirebasePushAdapter implements NotificationProviderPort {
    async send(eventName: string, contextData: Record<string, unknown>, options?: NotificationOptions): Promise<boolean> {
        try {
            const to = (contextData.to as string) || "";
            const usuarioId = (contextData.usuarioId as string) || options?.usuarioId;

            let targetUserId = usuarioId;

            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(to);
            if (!targetUserId && isUUID) {
                targetUserId = to;
            } else if (!targetUserId && to) {
                const user = await usuarioPushTokenRepository.findUsuarioByTelefone(to);
                if (user) {
                    targetUserId = user.id;
                }
            }

            if (!targetUserId) {
                logger.warn({ to, eventName }, "[FirebasePushAdapter] Não foi possível resolver o usuario_id para enviar o push.");
                return false;
            }

            const payload = FirebaseMapper.getTemplate(eventName, contextData);
            if (!payload) {
                return false;
            }

            const tokenStrings = await usuarioPushTokenRepository.findTokensByUsuarioId(targetUserId);
            if (tokenStrings.length === 0) {
                logger.info({ targetUserId, eventName }, "[FirebasePushAdapter] Usuário não possui tokens de push registrados.");
                return true;
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

            return true;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Erro desconhecido";
            logger.error({ error: message, eventName }, "[FirebasePushAdapter] Falha ao enviar notificação Push");
            return false;
        }
    }
}

