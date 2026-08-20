import { EVENTO_MOTORISTA_TESTE_BOAS_VINDAS } from "../../config/constants.js";
import { NotificationChannelEnum, UserType } from "../../types/enums.js";
import { logger } from "../../config/logger.js";
import { usuarioPushTokenRepository } from "../../repositories/usuario-push-token.repository.js";

import { onlyDigits } from "../../utils/string.utils.js";

import { NotificationProviderPort, NotificationSendResult } from "./ports/notification-provider.port.js";
import { EvolutionQueueAdapter } from "./adapters/evolution/evolution.adapter.js";
import { SmsAdapter } from "./adapters/sms/sms.adapter.js";
import { WabaAdapter } from "./adapters/waba/waba.adapter.js";
import { ResendAdapter } from "./adapters/resend/resend.adapter.js";
import { TelegramAdapter } from "./adapters/telegram/telegram.adapter.js";
import { FirebasePushAdapter } from "./adapters/firebase/firebase.adapter.js";

export type NotificationChannel = "EVOLUTION" | "SMS" | "RESEND" | "TELEGRAM" | "FIREBASE" | "WABA";

export interface NotificationOptions {
    channels?: NotificationChannelEnum[];
    evolution?: {
        instanceName?: string;
    };
    jobId?: string;
    usuarioId?: string;
    email?: string;
    metadata?: Record<string, unknown>;
}

class NotificationService {
    private adapters: Record<NotificationChannelEnum, NotificationProviderPort>;

    constructor() {
        this.adapters = {
            [NotificationChannelEnum.EVOLUTION]: new EvolutionQueueAdapter(),
            [NotificationChannelEnum.WABA]: new WabaAdapter(),
            [NotificationChannelEnum.SMS]: new SmsAdapter(),
            [NotificationChannelEnum.RESEND]: new ResendAdapter(),
            [NotificationChannelEnum.TELEGRAM]: new TelegramAdapter(),
            [NotificationChannelEnum.FIREBASE]: new FirebasePushAdapter()
        };
    }

    async sendDirect(
        channel: NotificationChannelEnum,
        eventName: string,
        contextData: Record<string, unknown>,
        options?: NotificationOptions
    ): Promise<NotificationSendResult> {
        const adapter = this.adapters[channel];
        if (!adapter) {
            const errStr = `[NotificationService] Adapter não encontrado para o canal ${channel}.`;
            logger.warn({ channel, eventName }, errStr);
            return { success: false, error: errStr };
        }

        const usuarioId = options?.usuarioId || (contextData?.usuarioId as string);
        const enrichedOptions = { ...options, usuarioId };
        const enrichedContext = { ...contextData, usuarioId };

        try {
            return await adapter.send(eventName, enrichedContext, enrichedOptions);
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, error: msg };
        }
    }

    async notifyPassenger(
        to: string,
        eventName: string,
        ctx: Record<string, unknown>,
        options: NotificationOptions
    ): Promise<boolean> {
        return await this._process(to, eventName, ctx, options);
    }

    async notifyRoute(
        to: string,
        eventName: string,
        ctx: Record<string, unknown>,
        options: NotificationOptions
    ): Promise<boolean> {
        return await this._process(to, eventName, ctx, options);
    }

    async notifyDriver(
        to: string,
        eventName: string,
        ctx: Record<string, unknown>,
        options: NotificationOptions
    ): Promise<boolean> {
        return await this._process(to, eventName, ctx, options);
    }

    async notifyAdmin(
        eventName: string,
        ctx: Record<string, unknown>,
        options: NotificationOptions
    ): Promise<boolean> {
        return await this._process("TELEGRAM_ADMIN", eventName, ctx, options);
    }

    private async _resolveTargetAddress(
        channel: NotificationChannelEnum,
        to: string,
        contextData: Record<string, unknown>,
        options: NotificationOptions
    ): Promise<string> {
        if (channel === NotificationChannelEnum.TELEGRAM) {
            return process.env.TELEGRAM_CHAT_ID || "TELEGRAM_ADMIN";
        }

        if (channel === NotificationChannelEnum.RESEND) {
            const directEmail = options?.email || (contextData?.email as string);
            if (directEmail && directEmail.includes("@")) return directEmail.trim();
            if (to && to.includes("@")) return to.trim();

            const usuarioId = (contextData.usuarioId || options.usuarioId) as string | undefined;
            if (usuarioId) {
                const user = await usuarioPushTokenRepository.findUsuarioById(usuarioId);
                if (user?.email && user.email.includes("@")) return user.email.trim();
            }

            if (to) {
                const user = await usuarioPushTokenRepository.findUsuarioByTelefone(to);
                if (user?.email && user.email.includes("@")) return user.email.trim();
            }

            return "";
        }

        return to || (options?.email as string) || (contextData?.email as string) || "";
    }

    private async _isChannelDeliverable(
        channel: NotificationChannelEnum,
        targetAddress: string,
        eventName: string,
        contextData: Record<string, unknown>,
        options: NotificationOptions
    ): Promise<boolean> {
        if (channel === NotificationChannelEnum.FIREBASE) {
            const isPassengerEvent = eventName.startsWith("PASSAGEIRO_") || eventName.startsWith("ROTA_");
            let targetUserId: string | undefined = undefined;

            if (isPassengerEvent && targetAddress) {
                const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetAddress);
                if (isUUID) {
                    targetUserId = targetAddress;
                } else {
                    const user = await usuarioPushTokenRepository.findUsuarioByTelefoneOrEmail(targetAddress);
                    targetUserId = user ? user.id : onlyDigits(targetAddress);
                }
            } else {
                targetUserId = (contextData.usuarioId as string) || options?.usuarioId;
                if (!targetUserId && targetAddress) {
                    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetAddress);
                    if (isUUID) {
                        targetUserId = targetAddress;
                    } else {
                        const user = await usuarioPushTokenRepository.findUsuarioByTelefoneOrEmail(targetAddress);
                        targetUserId = user ? user.id : onlyDigits(targetAddress);
                    }
                }
            }

            if (!targetUserId) return false;
            const tokenCount = await usuarioPushTokenRepository.countTokensByUsuarioId(targetUserId);
            return tokenCount > 0;
        }

        if (channel === NotificationChannelEnum.RESEND) {
            if (process.env.RESEND_OVERRIDE_EMAIL && process.env.RESEND_OVERRIDE_EMAIL.trim().includes("@")) {
                return true;
            }
            return !!(targetAddress && targetAddress.includes("@"));
        }

        if (channel === NotificationChannelEnum.EVOLUTION || channel === NotificationChannelEnum.WABA || channel === NotificationChannelEnum.SMS) {
            const phone = targetAddress || (contextData.telefone as string) || (contextData.phone as string);
            return !!(phone && phone.replace(/\D/g, "").length >= 8);
        }

        if (channel === NotificationChannelEnum.TELEGRAM) {
            return !!(process.env.TELEGRAM_BOT_TOKEN && (targetAddress || process.env.TELEGRAM_CHAT_ID));
        }

        return true;
    }

    private async _process(
        to: string,
        eventName: string,
        contextData: Record<string, unknown>,
        options: NotificationOptions
    ): Promise<boolean> {
        const channels = options?.channels;

        if (!channels || !Array.isArray(channels) || channels.length === 0) {
            logger.error(
                { eventName, to },
                "[NotificationService] ERRO CRÍTICO: Nenhum canal de notificação (channels) foi especificado nas opções. O disparo foi abortado."
            );
            return false;
        }
        const usuarioId = options?.usuarioId || (contextData?.usuarioId as string);

        const enrichedOptions = { ...options, usuarioId };
        const enrichedContext = { ...contextData, to, usuarioId };

        try {
            const { notificationQueueService } = await import("./notification-queue.service.js");
            const results: Promise<boolean>[] = [];

            for (const channel of channels) {
                const targetAddress = await this._resolveTargetAddress(
                    channel,
                    to,
                    enrichedContext,
                    enrichedOptions
                );

                const isDeliverable = await this._isChannelDeliverable(
                    channel,
                    targetAddress,
                    eventName,
                    enrichedContext,
                    enrichedOptions
                );

                if (!isDeliverable) {
                    logger.debug(
                        { channel, eventName, to },
                        "[NotificationService] Canal ignorado por ausência de destinatário/token válido (Short-Circuit)."
                    );
                    continue;
                }

                results.push(
                    notificationQueueService.enqueueAndProcess({
                        canal: channel,
                        evento: eventName,
                        destinatario: targetAddress,
                        payload: enrichedContext,
                        options: enrichedOptions,
                        usuarioId
                    })
                );
            }

            if (results.length === 0) {
                logger.info(
                    { eventName, to, channels },
                    "[NotificationService] Nenhum canal elegível para envio (Short-Circuit)."
                );
                return false;
            }

            const outcomes = await Promise.allSettled(results);
            return outcomes.some(o => o.status === "fulfilled" && o.value === true);
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error({ error: msg, eventName }, "[NotificationService] Erro ao orquestrar notificações.");
            return false;
        }
    }

    private async dispatchWelcomeNotification(usuario: { id: string; nome?: string; telefone?: string; email?: string; tipo?: UserType | string }): Promise<void> {
        const userType = usuario.tipo || UserType.MOTORISTA;

        switch (userType) {
            case UserType.MOTORISTA:
                logger.info({ userId: usuario.id, nome: usuario.nome, telefone: usuario.telefone }, "[NotificationService] Primeiro token de motorista registrado! Disparando Push de Boas-Vindas");
                await this.notifyDriver(usuario.telefone || '', EVENTO_MOTORISTA_TESTE_BOAS_VINDAS, {
                    nomeMotorista: usuario.nome || 'Motorista',
                    usuarioId: usuario.id,
                }, {
                    channels: [NotificationChannelEnum.FIREBASE],
                    usuarioId: usuario.id,
                });
                break;

            case UserType.MOTORISTA_AUXILIAR:
            case UserType.MONITOR:
            case UserType.RESPONSAVEL:
            case UserType.ADMIN:
            default:
                logger.info({ userId: usuario.id, userType }, "[NotificationService] Primeiro token de dispositivo registrado para perfil sem disparo de boas-vindas.");
                break;
        }
    }

    /**
     * Registra ou atualiza um push token (FCM) para o usuário atual
     */
    async registerPushToken(userId: string, token: string, platform: string): Promise<void> {
        logger.info({ userId, tokenSnippet: token ? token.substring(0, 15) + "..." : null, platform }, "[NotificationService.registerPushToken] Iniciando registro de token FCM");

        const existingToken = await usuarioPushTokenRepository.findByToken(token);

        if (existingToken) {
            if (existingToken.user_id !== userId) {
                logger.info({ oldUserId: existingToken.user_id, newUserId: userId }, "[NotificationService.registerPushToken] Token pertence a outro usuário, reatribuindo.");
                await usuarioPushTokenRepository.deleteByToken(token);
            } else {
                logger.info({ userId }, "[NotificationService.registerPushToken] Token já está associado a este usuário. Atualizando timestamp.");
                await usuarioPushTokenRepository.updateTokenPlatformAndTimestamp(token, platform);
                return;
            }
        }

        const userTokenCount = await usuarioPushTokenRepository.countTokensByUsuarioId(userId);
        const isFirstToken = userTokenCount === 0;

        await usuarioPushTokenRepository.insertToken(userId, token, platform);
        logger.info({ userId, isFirstToken, count: userTokenCount + 1 }, "[NotificationService.registerPushToken] Token salvo com sucesso na tabela usuario_push_tokens");

        if (isFirstToken) {
            const usuario = await usuarioPushTokenRepository.findUsuarioById(userId);

            if (usuario) {
                await this.dispatchWelcomeNotification(usuario).catch((err: unknown) => logger.error({ err: err instanceof Error ? err.message : String(err) }, "[NotificationService.registerPushToken] Erro ao enviar boas-vindas push"));
            }
        }
    }

    /**
     * Desregistra um push token
     */
    async unregisterPushToken(token: string): Promise<void> {
        await usuarioPushTokenRepository.deleteByToken(token);
    }
}

export const notificationService = new NotificationService();
