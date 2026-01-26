
import { Job, Worker } from 'bullmq';
import { GLOBAL_WHATSAPP_INSTANCE } from '../config/constants.js';
import { logger } from '../config/logger.js';
import { redisConfig } from '../config/redis.js';
import { QUEUE_NAME_WHATSAPP, WhatsappJobData } from '../queues/whatsapp.queue.js';
import { whatsappService } from '../services/whatsapp.service.js';
import { WhatsappStatus } from '../types/enums.js';

/**
 * Worker responsável por processar a fila de mensagens do WhatsApp.
 * Executa o envio real usando a whatsappService.
 * 
 * Agora com suporte a:
 * - Verificação de status da instância antes do envio
 * - Soft-reconnect automático para instâncias desconectadas
 * - Retry inteligente com backoff exponencial
 * - Monitoramento de Saúde em Background (Global Instance)
 */
export const whatsappWorker = new Worker<WhatsappJobData>(
    QUEUE_NAME_WHATSAPP,
    async (job: Job<WhatsappJobData>) => {
        const { phone, message, compositeMessage, context, options } = job.data;
        
        // 1. Determinar instância de envio (Por enquanto apenas Global, pronto para multiplas)
        let targetInstance = options?.instanceName || GLOBAL_WHATSAPP_INSTANCE;

        logger.debug({ jobId: job.id, phone, context, targetInstance, attempt: job.attemptsMade }, "[Worker] Processing WhatsApp Job...");

        try {
            // Delay artificial de segurança (Rate limit prevention)
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 2. Verificar status da instância antes de tentar envio
            let instanceStatus = await whatsappService.getInstanceStatus(targetInstance);
            
            // Verifica conexão (CONNECTED ou OPEN)
            const isConnected = instanceStatus.state === WhatsappStatus.CONNECTED || instanceStatus.state === WhatsappStatus.OPEN;

            if (!isConnected) {
                logger.warn({ 
                    jobId: job.id, 
                    targetInstance, 
                    state: instanceStatus.state 
                }, "[Worker] Instância desconectada/instável. Tentando soft-reconnect...");
                
                // Tentar reconectar (soft-reconnect)
                try {
                    await whatsappService.connectInstance(targetInstance);
                    
                    // Aguardar um pouco para a reconexão se estabelecer (Evolution precisa de tempo)
                    await new Promise(r => setTimeout(r, 5000));
                    
                    // Verificar novamente
                    instanceStatus = await whatsappService.getInstanceStatus(targetInstance);
                    const isNowConnected = instanceStatus.state === WhatsappStatus.CONNECTED || instanceStatus.state === WhatsappStatus.OPEN;

                    if (!isNowConnected) {
                        logger.warn({ 
                            jobId: job.id, 
                            targetInstance, 
                            state: instanceStatus.state 
                        }, "[Worker] Instância ainda desconectada após soft-reconnect. Mantendo job na fila para retry.");
                        
                        throw new Error(`Instância ${targetInstance} ainda desconectada após soft-reconnect. Estado: ${instanceStatus.state}`);
                    }
                    
                    logger.info({ jobId: job.id, targetInstance }, "[Worker] Soft-reconnect bem-sucedido. Prosseguindo com envio.");
                } catch (reconnectErr: any) {
                    logger.error({ 
                        jobId: job.id, 
                        error: reconnectErr.message || reconnectErr, 
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
            } catch (err: any) {
                logger.warn({ error: err.message, jobId: job.id }, `[Worker] Falha primária na instância ${targetInstance}`);
                success = false;
            }

            // 4. Fallback para Global se falhou e não era a Global
            // (Útil se no futuro tivermos instâncias secundárias rotativas)
            if (!success && targetInstance !== GLOBAL_WHATSAPP_INSTANCE) {
                logger.warn({ phone, failedInstance: targetInstance, jobId: job.id }, "[Worker] Tentando fallback para instância GLOBAL...");
                
                targetInstance = GLOBAL_WHATSAPP_INSTANCE;
                
                // Verificar status da Global também
                const globalStatus = await whatsappService.getInstanceStatus(GLOBAL_WHATSAPP_INSTANCE);
                const globalConnected = globalStatus.state === WhatsappStatus.CONNECTED || globalStatus.state === WhatsappStatus.OPEN;

                if (!globalConnected) {
                    logger.error({ jobId: job.id }, "[Worker] Instância GLOBAL também está desconectada. Mantendo job na fila.");
                    throw new Error("Instância GLOBAL desconectada. Não é possível fazer fallback.");
                }
                
                // Adicionar rodapé explicativo no fallback
                let fallbackMessage = message;
                let fallbackComposite = compositeMessage ? [...compositeMessage] : undefined;
                
                if (fallbackComposite) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

/**
 * Monitor de Saúde em Background
 * Garante que a instância Global esteja ativa mesmo sem mensagens na fila
 */
const startGlobalHealthCheck = () => {
    const checkInterval = 5 * 60 * 1000; // 5 minutos

    const check = async () => {
        try {
            const status = await whatsappService.getInstanceStatus(GLOBAL_WHATSAPP_INSTANCE);
            const isConnected = status.state === WhatsappStatus.CONNECTED || status.state === WhatsappStatus.OPEN;

            if (!isConnected) {
                logger.warn({ 
                    monitor: 'GlobalHealth', 
                    status: status.state 
                }, "⚠️ Instância Global offline. Iniciando auto-recovery em background...");
                
                await whatsappService.connectInstance(GLOBAL_WHATSAPP_INSTANCE);
            }
            logger.debug({ monitor: 'GlobalHealth', status: status.state }, "Health Check OK");
        } catch (error: any) {
            logger.error({ monitor: 'GlobalHealth', error: error.message }, "Erro no Health Check");
        }
    };

    // Inicia e agenda
    check();
    setInterval(check, checkInterval);
};

// Iniciar monitoramento ao carregar worker
startGlobalHealthCheck();
