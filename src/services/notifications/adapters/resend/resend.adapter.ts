import { Resend } from "resend";
import { logger } from "../../../../config/logger.js";
import { NotificationProviderPort } from "../../ports/notification-provider.port.js";
import { usuarioPushTokenRepository } from "../../../../repositories/usuario-push-token.repository.js";
import { ResendMapper } from "./resend.mapper.js";
import { ResendTemplatePayload, ResendTemplateContext } from "./resend.template.js";

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

    async send(eventName: string, contextData: Record<string, unknown>, options?: Record<string, unknown>): Promise<boolean> {
        try {
            if (!this.resendClient) {
                logger.error({ eventName }, "[ResendAdapter] Impossível enviar e-mail: RESEND_API_KEY não está configurada.");
                return false;
            }

            const recipientEmail = await this.resolveRecipient(contextData, options);
            if (!recipientEmail) {
                logger.warn({ eventName, to: contextData.to, usuarioId: contextData.usuarioId }, "[ResendAdapter] E-mail de destino válido não encontrado para o usuário.");
                return false;
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
                return false;
            }

            return await this.executeResendSend(recipientEmail, eventName, template);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error({ error: errorMessage, eventName }, "[ResendAdapter] Falha de exceção ao disparar e-mail");
            return false;
        }
    }

    /**
     * Resolução resiliente do e-mail de destino com suporte a override em DEV
     */
    private async resolveRecipient(ctx: Record<string, unknown>, opts?: Record<string, unknown>): Promise<string | null> {
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
    private async executeResendSend(to: string, eventName: string, template: ResendTemplatePayload): Promise<boolean> {
        if (!this.resendClient) return false;

        const response = await this.resendClient.emails.send({
            from: this.fromEmail,
            to,
            subject: template.subject,
            html: template.html,
            text: template.text,
        });

        if (response.error) {
            logger.error({
                error: response.error,
                from: this.fromEmail,
                to,
                eventName
            }, "[ResendAdapter] Erro ao enviar e-mail via Resend API");
            return false;
        }

        logger.info({
            id: response.data?.id,
            from: this.fromEmail,
            to,
            eventName
        }, "[ResendAdapter] E-mail enviado com sucesso via Resend");
        return true;
    }
}
