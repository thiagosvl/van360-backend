import { Job, Worker } from 'bullmq';
import { GLOBAL_WHATSAPP_INSTANCE } from '../config/constants.js';
import { logger } from '../config/logger.js';
import { redisConfig } from '../config/redis.js';
import { QUEUE_NAME_WHATSAPP, WhatsappJobData } from '../queues/whatsapp.queue.js';
import { whatsappService } from '../services/whatsapp.service.js';

/**
 * Worker responsável por processar a fila de mensagens do WhatsApp.
 * Executa o envio real usando a whatsappService.
 */
export const whatsappWorker = new Worker<WhatsappJobData>(
    QUEUE_NAME_WHATSAPP,
    async (job: Job<WhatsappJobData>) => {
        const { phone, message, compositeMessage, context, options } = job.data;
        
        // 1. Determinar instância de envio (Driver ou Global)
        let targetInstance = options?.instanceName || GLOBAL_WHATSAPP_INSTANCE;

        logger.debug({ jobId: job.id, phone, context, targetInstance }, "[Worker] Processing WhatsApp Job...");

        try {
            // Delay artificial de segurança
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 2. Tentar envio principal
            let success = false;
            
            try {
                if (compositeMessage) {
                    success = await whatsappService.sendCompositeMessage(phone, compositeMessage, targetInstance);
                } else if (message) {
                    success = await whatsappService.sendText(phone, message, targetInstance);
                }
            } catch (err) {
                logger.warn({ error: err }, `[Worker] Falha primária na instância ${targetInstance}`);
                success = false;
            }

            // 3. Fallback para Global se falhou e não era a Global
            if (!success && targetInstance !== GLOBAL_WHATSAPP_INSTANCE) {
                logger.warn({ phone, failedInstance: targetInstance }, "[Worker] Tentando fallback para instância GLOBAL...");
                
                targetInstance = GLOBAL_WHATSAPP_INSTANCE;
                
                // Adicionar rodapé explicativo no fallback
                let fallbackMessage = message;
                let fallbackComposite = compositeMessage ? [...compositeMessage] : undefined;
                
                if (fallbackComposite) {
                    fallbackComposite = fallbackComposite.map((p: any) => ({
                        ...p,
                        content: p.content ? `${p.content}\n\n_(Mensagem enviada pelo sistema Van360 em nome do transporte)_` : undefined
                    }));
                    success = await whatsappService.sendCompositeMessage(phone, fallbackComposite, targetInstance);
                } else if (fallbackMessage) {
                    fallbackMessage += "\n\n_(Mensagem enviada pelo sistema Van360 em nome do transporte)_";
                    success = await whatsappService.sendText(phone, fallbackMessage, targetInstance);
                }
            }

            if (!success) {
                throw new Error(`Falha total no envio para ${phone} via ${targetInstance}`);
            }

            logger.info({ jobId: job.id, phone, sentVia: targetInstance }, "[Worker] Job Completed Successfully");
        } catch (error: any) {
            logger.error({ jobId: job.id, error: error.message }, "[Worker] Job Failed");
            throw error;
        }
    },
    {
        connection: redisConfig,
        concurrency: 1, 
        limiter: {
             max: 10, 
             duration: 10000 
        }
    }
);

// Event listeners para monitoramento
whatsappWorker.on('completed', job => {
    logger.debug({ jobId: job.id }, `[Worker] Job ${job.id} has completed!`);
});

whatsappWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, `[Worker] Job ${job?.id} has failed`);
});
