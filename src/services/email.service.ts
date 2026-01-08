import { logger } from "../config/logger.js";

interface EmailMessage {
    to: string;
    subject: string;
    htmlBody: string;
    attachments?: { filename: string, content: Buffer | string, contentType: string }[];
}

/**
 * Serviço de E-mail (Casca / Shell)
 * Futuro: Integrar com AWS SES, Resend, SendGrid, etc.
 */
class EmailService {

    /**
     * Envia um e-mail (Simulado por enquanto)
     */
    async send(message: EmailMessage): Promise<boolean> {
        try {
            // Em dev/mock, apenas logamos
            logger.info({ 
                to: message.to, 
                subject: message.subject,
                hasAttachments: message.attachments?.length || 0 
            }, "📧 [MOCK EMAIL] Enviando E-mail...");

            // Simulação de delay de rede
            // await new Promise(r => setTimeout(r, 500));

            logger.info("📧 [MOCK EMAIL] Enviado com sucesso.");
            return true;

        } catch (error: any) {
            logger.error({ error: error.message }, "Erro ao enviar e-mail");
            return false;
        }
    }
}

export const emailService = new EmailService();
