import { logger } from "../config/logger.js";

/**
 * Serviço de SMS (Casca / Shell)
 * Futuro: Integrar com Twilio, Zenvia, AWS SNS, etc.
 */
class SmsService {

    /**
     * Envia um SMS (Simulado por enquanto)
     */
    async send(number: string, text: string): Promise<boolean> {
        try {
            // Formatar número
            const cleanNumber = number.replace(/\D/g, "");
            
            // Em dev/mock, apenas logamos
            logger.info({ 
                number: cleanNumber, 
                textLength: text.length 
            }, "📱 [MOCK SMS] Enviando SMS...");

            // Simulação
            // await new Promise(r => setTimeout(r, 200));

            logger.info("📱 [MOCK SMS] Enviado com sucesso.");
            return true;

        } catch (error: any) {
            logger.error({ error: error.message }, "Erro ao enviar SMS");
            return false;
        }
    }
}

export const smsService = new SmsService();
