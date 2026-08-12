import axios from "axios";
import { logger } from "../../../../config/logger.js";
import { NotificationProviderPort } from "../../ports/notification-provider.port.js";
import { usuarioPushTokenRepository } from "../../../../repositories/usuario-push-token.repository.js";
import { WabaMapper } from "./waba.mapper.js";
import { NotificationOptions } from "../../notification.service.js";

export class WabaAdapter implements NotificationProviderPort {
    async send(eventName: string, contextData: Record<string, unknown>, options?: NotificationOptions): Promise<boolean> {
        try {
            const rawPhone = await this.resolveRecipientPhone(contextData, options);
            if (!rawPhone) {
                logger.warn(
                    { eventName, usuarioId: contextData.usuarioId },
                    "[WabaAdapter] Telefone de destino não informado nem encontrado no perfil do usuário."
                );
                return false;
            }

            const digitsOnly = String(rawPhone).replace(/\D/g, "");
            const formattedPhone = digitsOnly.startsWith("55") ? digitsOnly : `55${digitsOnly}`;

            const payload = WabaMapper.getTemplate(eventName, contextData);
            if (!payload || !payload.templateName) {
                logger.warn({ eventName }, "[WabaAdapter] Payload do template WABA não encontrado para este evento.");
                return false;
            }

            const apiUrl = process.env.WABA_API_URL || "https://graph.facebook.com/v21.0";
            const phoneNumberId = process.env.WABA_PHONE_NUMBER_ID;
            const accessToken = process.env.WABA_ACCESS_TOKEN;

            if (!phoneNumberId || !accessToken) {
                logger.error({ phoneNumberId: !!phoneNumberId, accessToken: !!accessToken }, "[WabaAdapter] Credenciais WABA ausentes no .env");
                return false;
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
                return true;
            } catch (apiError: unknown) {
                const errorData = axios.isAxiosError(apiError) ? apiError.response?.data || apiError.message : String(apiError);
                logger.error({ error: errorData, eventName, templateName: payload.templateName }, "[WabaAdapter] Erro ao enviar template WABA na Meta API");
                return false;
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error({ error: message, eventName }, "[WabaAdapter] Falha ao enviar notificação WABA");
            return false;
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

