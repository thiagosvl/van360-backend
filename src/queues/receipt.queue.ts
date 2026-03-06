import { logger } from "../config/logger.js";
import { ReceiptData } from "../services/receipt.service.js";
import { createQueue } from "./index.js";

export const QUEUE_NAME_RECEIPT = 'receipt-queue';

export const receiptQueue = createQueue(QUEUE_NAME_RECEIPT);

export interface ReceiptJobData {
    receiptData: ReceiptData;
    // Contexto para o passo seguinte (Notificação)
    notificationContext?: {
        phone: string;
        eventType: string; // Ex: PASSENGER_EVENT_PAYMENT_RECEIVED
        userId?: string; // Para identificar instância
        // Dados extras para o template de notificação
        templateData?: any; 
    };
}

/**
 * Adiciona um job de geração de recibo na fila.
 * IDEMPOTÊNCIA: JobId = `receipt-{tipo}-{id}` assegura que não geramos recibos
 * duplicados para o mesmo evento de pagamento/assinatura.
 */
export const addToReceiptQueue = async (data: ReceiptJobData) => {
    try {
        const jobId = `receipt-${data.receiptData.tipo || 'default'}-${data.receiptData.id}`;
        
        await receiptQueue.add('generate-receipt', data, { jobId });
        
        logger.debug({ jobId }, "[Queue] Job added to receipt-queue");
    } catch (error: any) {
        logger.error({ error: error.message }, "[Queue] Failed to add job to receipt-queue");
        throw error;
    }
};
