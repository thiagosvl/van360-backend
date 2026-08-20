import { Resend } from "resend";
import { logger } from "../../../../config/logger.js";
import { NotificationProviderPort, NotificationSendResult } from "../../ports/notification-provider.port.js";
import { usuarioPushTokenRepository } from "../../../../repositories/usuario-push-token.repository.js";
import { ResendMapper } from "./resend.mapper.js";
import { ResendTemplatePayload, ResendTemplateContext } from "./resend.template.js";
import { NotificationOptions } from "../../notification.service.js";

export class ResendAdapter implements NotificationProviderPort {
    private resendClient: Resend | null = null;
    private fromEmail: string;

    constructor() {
        const apiKey = process.env.RESEND_API_KEY;
        this.fromEmail = process.env.RESEND_FROM_EMAIL || "Van360 <contato@van360.com.br>";

        if (apiKey) {
            this.resendClient = new Resend(apiKey);
        } else {
            logger.warn("[ResendAdapter] RESEND_API_KEY não configurada no ambiente.");
        }
    }

    async send(eventName: string, contextData: Record<string, unknown>, options?: NotificationOptions): Promise<NotificationSendResult> {
        try {
            if (!this.resendClient) {
                const err = "[ResendAdapter] Impossível enviar e-mail: RESEND_API_KEY não está configurada.";
                logger.error({ eventName }, err);
                return { success: false, error: err };
            }

            const recipientEmail = await this.resolveRecipient(contextData, options);
            if (!recipientEmail) {
                const err = "[ResendAdapter] E-mail de destino não cadastrado.";
                logger.warn({ eventName, to: contextData.to, usuarioId: contextData.usuarioId }, err);
                return { success: false, error: err };
            }

            // Resolve o e-mail real do usuário (para Magic Link correto mesmo com OVERRIDE_EMAIL ativo em DEV)
            let realUserEmail: string | undefined = typeof contextData.email === "string" && contextData.email.includes("@") ? contextData.email : undefined;
            if (!realUserEmail && contextData.usuarioId) {
                const userObj = await usuarioPushTokenRepository.findUsuarioById(contextData.usuarioId as string);
                if (userObj?.email) {
                    realUserEmail = userObj.email;
                }
            }
            if (!realUserEmail) {
                realUserEmail = recipientEmail || undefined;
            }

            const template = await ResendMapper.getTemplate(eventName, {
                ...contextData,
                email: realUserEmail,
            } as ResendTemplateContext);
            if (!template) {
                const err = `[ResendAdapter] Template não encontrado para evento '${eventName}'`;
                return { success: false, error: err };
            }

            return await this.executeResendSend(recipientEmail, eventName, template);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error({ error: errorMessage, eventName }, "[ResendAdapter] Falha de exceção ao disparar e-mail");
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Resolução resiliente do e-mail de destino com suporte a override em DEV
     */
    private async resolveRecipient(ctx: Record<string, unknown>, opts?: NotificationOptions): Promise<string | null> {
        const overrideEmail = process.env.RESEND_OVERRIDE_EMAIL;
        if (overrideEmail && overrideEmail.trim().includes("@")) {
            return overrideEmail.trim();
        }

        const directEmail = ctx.email || opts?.email;
        if (typeof directEmail === "string" && directEmail.includes("@")) {
            return directEmail;
        }

        if (typeof ctx.to === "string" && ctx.to.includes("@")) {
            return ctx.to;
        }

        const usuarioId = (ctx.usuarioId || opts?.usuarioId) as string | undefined;
        if (usuarioId) {
            const user = await usuarioPushTokenRepository.findUsuarioById(usuarioId);
            if (user?.email) return user.email;
        }

        if (typeof ctx.to === "string") {
            const user = await usuarioPushTokenRepository.findUsuarioByTelefone(ctx.to);
            if (user?.email) return user.email;
        }

        return null;
    }

    /**
     * Disparo real via Resend API
     */
    private async executeResendSend(to: string, eventName: string, template: ResendTemplatePayload): Promise<NotificationSendResult> {
        if (!this.resendClient) return { success: false, error: "[ResendAdapter] Cliente Resend não inicializado" };

        const response = await this.resendClient.emails.send({
            from: this.fromEmail,
            to,
            subject: template.subject,
            html: template.html,
            text: template.text,
        });

        if (response.error) {
            const errStr = response.error.message || JSON.stringify(response.error);
            logger.error({
                error: response.error,
                from: this.fromEmail,
                to,
                eventName
            }, "[ResendAdapter] Erro ao enviar e-mail via Resend API");
            return { success: false, error: `Resend API Error: ${errStr}` };
        }

        logger.info({
            id: response.data?.id,
            from: this.fromEmail,
            to,
            eventName
        }, "[ResendAdapter] E-mail enviado com sucesso via Resend");
        return { success: true };
    }
}
