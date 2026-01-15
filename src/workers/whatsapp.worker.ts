import { Job, Worker } from 'bullmq';
import { GLOBAL_WHATSAPP_INSTANCE, WHATSAPP_STATUS } from '../config/constants.js';
import { logger } from '../config/logger.js';
import { redisConfig } from '../config/redis.js';
import { QUEUE_NAME_WHATSAPP, WhatsappJobData } from '../queues/whatsapp.queue.js';
import { whatsappService } from '../services/whatsapp.service.js';

/**
 * Worker responsável por processar a fila de mensagens do WhatsApp.
 * Executa o envio real usando a whatsappService.
 * 
 * Agora com suporte a:
 * - Verificação de status da instância antes do envio
 * - Soft-reconnect automático para instâncias desconectadas
 * - Retry inteligente com backoff exponencial
 */
export const whatsappWorker = new Worker<WhatsappJobData>(
    QUEUE_NAME_WHATSAPP,
    async (job: Job<WhatsappJobData>) => {
        const { phone, message, compositeMessage, context, options } = job.data;
        
        // 1. Determinar instância de envio (Driver ou Global)
        let targetInstance = options?.instanceName || GLOBAL_WHATSAPP_INSTANCE;

        logger.debug({ jobId: job.id, phone, context, targetInstance, attempt: job.attemptsMade }, "[Worker] Processing WhatsApp Job...");

        try {
            // Delay artificial de segurança
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 2. Verificar status da instância antes de tentar envio
            let instanceStatus = await whatsappService.getInstanceStatus(targetInstance);
            
            if (instanceStatus.state === WHATSAPP_STATUS.DISCONNECTED || instanceStatus.state === "ERROR") {
                logger.warn({ 
                    jobId: job.id, 
                    targetInstance, 
                    state: instanceStatus.state 
                }, "[Worker] Instância desconectada. Tentando soft-reconnect...");
                
                // Tentar reconectar (soft-reconnect)
                try {
                    await whatsappService.connectInstance(targetInstance);
                    
                    // Aguardar um pouco para a reconexão se estabelecer
                    await new Promise(r => setTimeout(r, 5000));
                    
                    // Verificar novamente
                    instanceStatus = await whatsappService.getInstanceStatus(targetInstance);
                    
                    if (instanceStatus.state !== WHATSAPP_STATUS.CONNECTED && instanceStatus.state !== "open") {
                        logger.warn({ 
                            jobId: job.id, 
                            targetInstance, 
                            state: instanceStatus.state 
                        }, "[Worker] Instância ainda desconectada após soft-reconnect. Mantendo job na fila para retry.");
                        
                        throw new Error(`Instância ${targetInstance} ainda desconectada após soft-reconnect. Estado: ${instanceStatus.state}`);
                    }
                    
                    logger.info({ jobId: job.id, targetInstance }, "[Worker] Soft-reconnect bem-sucedido. Prosseguindo com envio.");
                } catch (reconnectErr) {
                    logger.error({ 
                        jobId: job.id, 
                        error: reconnectErr, 
                        targetInstance 
                    }, "[Worker] Falha no soft-reconnect. Mantendo job na fila.");
                    
                    throw new Error(`Soft-reconnect falhou para ${targetInstance}`);
                }
            }

            // 3. Tentar envio principal
            let success = false;
            
            try {
                if (compositeMessage) {
                    success = await whatsappService.sendCompositeMessage(phone, compositeMessage, targetInstance);
                } else if (message) {
                    success = await whatsappService.sendText(phone, message, targetInstance);
                }
            } catch (err) {
                logger.warn({ error: err, jobId: job.id }, `[Worker] Falha primária na instância ${targetInstance}`);
                success = false;
            }

            // 4. Fallback para Global se falhou e não era a Global
            if (!success && targetInstance !== GLOBAL_WHATSAPP_INSTANCE) {
                logger.warn({ phone, failedInstance: targetInstance, jobId: job.id }, "[Worker] Tentando fallback para instância GLOBAL...");
                
                targetInstance = GLOBAL_WHATSAPP_INSTANCE;
                
                // Verificar status da Global também
                const globalStatus = await whatsappService.getInstanceStatus(GLOBAL_WHATSAPP_INSTANCE);
                if (globalStatus.state !== WHATSAPP_STATUS.CONNECTED && globalStatus.state !== "open") {
                    logger.error({ jobId: job.id }, "[Worker] Instância GLOBAL também está desconectada. Mantendo job na fila.");
                    throw new Error("Instância GLOBAL desconectada. Não é possível fazer fallback.");
                }
                
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
            logger.error({ 
                jobId: job.id, 
                error: error.message, 
                attempt: job.attemptsMade,
                maxAttempts: job.opts.attempts
            }, "[Worker] Job Failed");
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
    logger.error({ 
        jobId: job?.id, 
        err: err.message,
        attempt: job?.attemptsMade,
        maxAttempts: job?.opts.attempts
    }, `[Worker] Job ${job?.id} has failed`);
});

whatsappWorker.on('stalled', (jobId) => {
    logger.warn({ jobId }, `[Worker] Job ${jobId} has stalled (taking too long)`);
});
