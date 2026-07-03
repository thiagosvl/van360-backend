import { Job, Worker } from 'bullmq';
import { GLOBAL_WHATSAPP_INSTANCE } from '../config/constants.js';
import { logger } from '../config/logger.js';
import { redisConfig } from '../config/redis.js';
import { QUEUE_NAME_WHATSAPP_TRANSACTIONAL, QUEUE_NAME_WHATSAPP_BULK, WhatsappJobData } from '../queues/whatsapp.queue.js';
import { whatsappService } from '../services/whatsapp.service.js';
import { WhatsappStatus } from '../types/enums.js';

const createWhatsappProcessor = (isBulk: boolean) => async (job: Job<WhatsappJobData>) => {
    const { phone, message, compositeMessage, context, options } = job.data;
    let targetInstance = options?.instanceName || GLOBAL_WHATSAPP_INSTANCE;

    try {
        if (isBulk) {
            // Atraso estocástico para envios em massa (2 a 6 segundos)
            const delayMs = Math.floor(Math.random() * 4000) + 2000;
            await new Promise(r => setTimeout(r, delayMs));
        } else {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        let instanceStatus = await whatsappService.getInstanceStatus(targetInstance);
        const state = instanceStatus.state;
        
        const isConnected = state === WhatsappStatus.CONNECTED || state === WhatsappStatus.OPEN;
        const isConnecting = state === WhatsappStatus.CONNECTING;

        const ERROR_WAITING_CONNECTION = "AGUARDANDO_CONEXAO_WHATSAPP";

        if (!isConnected) {
            if (isConnecting) {
                logger.info({ jobId: job.id, targetInstance }, "[WhatsappWorker] Instância aguardando leitura do QR Code. O envio será processado automaticamente após o pareamento.");
                throw new Error(ERROR_WAITING_CONNECTION); // Isso aciona o retry do BullMQ
            } else {
                try {
                    logger.warn({ targetInstance }, "[WhatsappWorker] Instância offline. Tentando restabelecer link...");
                    await whatsappService.connectInstance(targetInstance);
                    
                    // Pequeno delay para a Evolution processar o comando
                    await new Promise(r => setTimeout(r, 2000));
                    
                    // Lança o erro de aguardar para que o próximo retry já tente enviar ou mostre que está 'connecting'
                    throw new Error(ERROR_WAITING_CONNECTION);
                } catch (reconnectErr: unknown) {
                    const errMsg = reconnectErr instanceof Error ? reconnectErr.message : "Erro desconhecido";
                    if (errMsg === ERROR_WAITING_CONNECTION) throw reconnectErr;
                    
                    throw new Error(`Falha no auto-reconnect: ${errMsg}`);
                }
            }
        }

        let success = false;
        
        try {
            if (compositeMessage) {
                success = await whatsappService.sendCompositeMessage(phone, compositeMessage, targetInstance);
            } else if (message) {
                success = await whatsappService.sendText(phone, message, targetInstance);
            }
        } catch (error: unknown) {
            success = false;
        }

        if (!success && targetInstance !== GLOBAL_WHATSAPP_INSTANCE) {
            logger.warn({ phone, jobId: job.id }, "[WhatsappWorker] Fallback para instância GLOBAL...");
            
            targetInstance = GLOBAL_WHATSAPP_INSTANCE;
            const globalStatus = await whatsappService.getInstanceStatus(GLOBAL_WHATSAPP_INSTANCE);
            const globalConnected = globalStatus.state === WhatsappStatus.CONNECTED || globalStatus.state === WhatsappStatus.OPEN;

            if (!globalConnected) {
                throw new Error("Instância GLOBAL offline.");
            }
            
            if (compositeMessage) {
                const fallbackComposite = compositeMessage.map((p: any) => ({
                    ...p,
                    content: p.content ? `${p.content}\n\n_(Mensagem enviada pelo sistema Van360)_` : undefined
                }));
                success = await whatsappService.sendCompositeMessage(phone, fallbackComposite, targetInstance);
            } else if (message) {
                const fallbackMessage = `${message}\n\n_(Mensagem enviada pelo sistema Van360)_`;
                success = await whatsappService.sendText(phone, fallbackMessage, targetInstance);
            }
        }

        if (!success) {
            throw new Error(`Falha total no envio para ${phone}`);
        }

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Erro interno no Worker";
        logger.error({ jobId: job.id, error: message }, "[WhatsappWorker] Job finalizado com erro");
        throw error;
    }
};

export const whatsappTransactionalWorker = new Worker<WhatsappJobData>(
    QUEUE_NAME_WHATSAPP_TRANSACTIONAL,
    createWhatsappProcessor(false),
    {
        connection: redisConfig,
        concurrency: 1, 
        limiter: {
             max: 50, // Permite 50 mensagens
             duration: 10000 // a cada 10 segundos
        }
    }
);

export const whatsappBulkWorker = new Worker<WhatsappJobData>(
    QUEUE_NAME_WHATSAPP_BULK,
    createWhatsappProcessor(true),
    {
        connection: redisConfig,
        concurrency: 1, 
        limiter: {
             max: 1, // Permite 1 mensagem
             duration: 15000 // a cada 15 segundos
        }
    }
);

whatsappTransactionalWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "[WhatsappTransactionalWorker] Job falhou");
});

whatsappBulkWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "[WhatsappBulkWorker] Job falhou");
});

const startGlobalHealthCheck = () => {
    const checkInterval = 5 * 60 * 1000;

    const check = async () => {
        try {
            const status = await whatsappService.getInstanceStatus(GLOBAL_WHATSAPP_INSTANCE);
            const isConnected = status.state === WhatsappStatus.CONNECTED || status.state === WhatsappStatus.OPEN;
            const isConnecting = status.state === WhatsappStatus.CONNECTING;

            if (!isConnected && !isConnecting) {
                await whatsappService.connectInstance(GLOBAL_WHATSAPP_INSTANCE);
            }
        } catch (error: unknown) {}
    };

    setTimeout(check, 5000);
    setInterval(check, checkInterval);
};

startGlobalHealthCheck();
