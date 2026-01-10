import { Job, Worker } from 'bullmq';
import { logger } from '../config/logger.js';
import { redisConfig } from '../config/redis.js';
import { supabaseAdmin } from '../config/supabase.js';
import { QUEUE_NAME_RECEIPT, ReceiptJobData } from '../queues/receipt.queue.js';
import { notificationService } from '../services/notifications/notification.service.js';
import { receiptService } from '../services/receipt.service.js';

/**
 * Worker responsável por gerar recibos (CPU Intensive)
 * Fluxo:
 * 1. Gera Imagem (Satori -> PNG)
 * 2. Upload para Storage
 * 3. Atualiza registro no Banco (Cobranca ou Assinatura)
 * 4. Dispara Notificação (via Queue de WhatsApp, chamada pelo NotificationService)
 */
export const receiptWorker = new Worker<ReceiptJobData>(
    QUEUE_NAME_RECEIPT,
    async (job: Job<ReceiptJobData>) => {
        const { receiptData, notificationContext } = job.data;
        const { id, tipo } = receiptData;

        logger.debug({ jobId: job.id, cobrancaId: id }, "[Worker] Generating Receipt...");

        try {
            // 1. Gerar e Salvar Recibo
            const reciboUrl = await receiptService.generateAndSave(receiptData);

            if (!reciboUrl) {
                throw new Error("Falha ao gerar URL do recibo");
            }

            // 2. Atualizar Banco de Dados com a URL
            const table = tipo === 'ASSINATURA' ? 'assinaturas_cobrancas' : 'cobrancas';
            
            const { error: updateError } = await supabaseAdmin
                .from(table)
                .update({ recibo_url: reciboUrl })
                .eq('id', id);

            if (updateError) {
                logger.error({ updateError, id, table }, "[Worker] Falha ao salvar URL do recibo no banco");
                // Não falha o job inteiro pois o recibo existe, apenas não salvou o link.
                // Mas idealmente deveria falhar para retry. Vamos logar e seguir para notificar se der.
            }

            logger.info({ jobId: job.id, cobrancaId: id, reciboUrl }, "[Worker] Receipt Generated & Saved");

            // 3. Disparar Notificação (Se houver contexto)
            if (notificationContext) {
                logger.debug({ jobId: job.id, context: notificationContext }, "[Worker] Triggering Notification...");
                
                // Reconstrói o contexto para o template, adicionando a URL do recibo
                const templateCtx = {
                    ...notificationContext.templateData,
                    reciboUrl, // Injeta a URL gerada
                    valor: receiptData.valor,
                    nomePagador: receiptData.pagadorNome,
                    nomePassageiro: receiptData.passageiroNome
                };

                // Usa o notificationService (que agora internamente usa a whatsappQueue)
                if (receiptData.tipo === 'ASSINATURA') {
                     await notificationService.notifyDriver(
                        notificationContext.phone, 
                        notificationContext.eventType as any, 
                        templateCtx
                    );
                } else {
                    await notificationService.notifyPassenger(
                        notificationContext.phone,
                        notificationContext.eventType as any,
                        templateCtx
                    );
                }
            }

        } catch (error: any) {
            logger.error({ jobId: job.id, error: error.message }, "[Worker] Receipt Job Failed");
            throw error;
        }
    },
    {
        connection: redisConfig,
        concurrency: 2, // Pode processar 2 recibos em paralelo (Satori usa CPU, mas é rápido)
        limiter: {
             max: 50, 
             duration: 10000 
        }
    }
);
