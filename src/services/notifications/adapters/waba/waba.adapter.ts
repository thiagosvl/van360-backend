import axios from "axios";
import { logger } from "../../../../config/logger.js";
import { env } from "../../../../config/env.js";
import { NotificationProviderPort, NotificationSendResult } from "../../ports/notification-provider.port.js";
import { usuarioPushTokenRepository } from "../../../../repositories/usuario-push-token.repository.js";
import { WabaMapper } from "./waba.mapper.js";
import { NotificationOptions } from "../../notification.service.js";

export class WabaAdapter implements NotificationProviderPort {
    async send(eventName: string, contextData: Record<string, unknown>, options?: NotificationOptions): Promise<NotificationSendResult> {
        try {
            const rawPhone = await this.resolveRecipientPhone(contextData, options);
            if (!rawPhone) {
                const errStr = "[WabaAdapter] Telefone de destino não informado nem encontrado no perfil do usuário.";
                logger.warn(
                    { eventName, usuarioId: contextData.usuarioId },
                    errStr
                );
                return { success: false, error: errStr };
            }

            const digitsOnly = String(rawPhone).replace(/\D/g, "");
            const formattedPhone = digitsOnly.startsWith("55") ? digitsOnly : `55${digitsOnly}`;

            const payload = WabaMapper.getTemplate(eventName, contextData);
            if (!payload || !payload.templateName) {
                const errStr = `[WabaAdapter] Payload do template WABA não encontrado para o evento '${eventName}'.`;
                logger.warn({ eventName }, errStr);
                return { success: false, error: errStr };
            }

            const apiUrl = env.WABA_API_URL;
            const phoneNumberId = env.WABA_PHONE_NUMBER_ID;
            const accessToken = env.WABA_ACCESS_TOKEN;

            if (!phoneNumberId || !accessToken) {
                const errStr = "[WabaAdapter] Credenciais WABA (WABA_PHONE_NUMBER_ID / WABA_ACCESS_TOKEN) ausentes no .env";
                logger.error({ phoneNumberId: !!phoneNumberId, accessToken: !!accessToken }, errStr);
                return { success: false, error: errStr };
            }

            const url = `${apiUrl}/${phoneNumberId}/messages`;

            const requestBody = {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: formattedPhone,
                type: "template",
                template: {
                    name: payload.templateName,
                    language: {
                        code: payload.languageCode || "pt_BR"
                    },
                    components: payload.components
                }
            };

            try {
                const response = await axios.post(url, requestBody, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json"
                    }
                });
                const messageId = response.data?.messages?.[0]?.id;
                logger.info({ to: formattedPhone, eventName, messageId, templateName: payload.templateName }, "[WabaAdapter] Mensagem WABA enviada com sucesso via Meta API");
                return { success: true, providerMessageId: messageId };
            } catch (apiError: unknown) {
                let errorDetails = "";
                if (axios.isAxiosError(apiError)) {
                    const metaErrorData = apiError.response?.data?.error;
                    if (metaErrorData) {
                        const details = metaErrorData.error_data?.details || metaErrorData.message || JSON.stringify(metaErrorData);
                        const code = metaErrorData.code ? `(#${metaErrorData.code}) ` : "";
                        errorDetails = `${code}${details}`;
                    } else {
                        errorDetails = apiError.response?.data ? JSON.stringify(apiError.response.data) : apiError.message;
                    }
                } else {
                    errorDetails = apiError instanceof Error ? apiError.message : String(apiError);
                }

                logger.error({ error: axios.isAxiosError(apiError) ? apiError.response?.data || apiError.message : String(apiError), eventName, templateName: payload.templateName }, "[WabaAdapter] Erro ao enviar template WABA na Meta API");
                return { success: false, error: errorDetails };
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error({ error: message, eventName }, "[WabaAdapter] Falha ao enviar notificação WABA");
            return { success: false, error: message };
        }
    }

    private async resolveRecipientPhone(ctx: Record<string, unknown>, opts?: NotificationOptions): Promise<string | null> {
        const directPhone = (ctx.to || ctx.telefone || ctx.telefone_responsavel || (opts?.metadata?.telefone as string)) as string | undefined;
        if (directPhone && String(directPhone).replace(/\D/g, "").length >= 8) {
            return String(directPhone);
        }

        const usuarioId = (ctx.usuarioId || opts?.usuarioId) as string | undefined;
        if (usuarioId) {
            const user = await usuarioPushTokenRepository.findUsuarioById(usuarioId);
            if (user?.telefone) return user.telefone;
        }

        return null;
    }
}

