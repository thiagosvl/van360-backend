import { logger } from "../config/logger.js";
import { createQueue } from "./index.js";

export const QUEUE_NAME_PIX = 'pix-queue';

export const pixQueue = createQueue(QUEUE_NAME_PIX);

export interface PixJobData {
    cobrancaId: string;
    valor: number;
    cpf: string;
    nome: string;
    dataVencimento: string;
    txid?: string; // ID estável para esta tentativa de geração
}

/**
 * Adiciona um job de registro de PIX na fila (para geração em lote).
 * IDEMPOTÊNCIA: Job ID = `pix-{cobrancaId}` para evitar registros duplicados.
 */
export const addToPixQueue = async (data: PixJobData) => {
    // IDEMPOTÊNCIA STABLE: O Job ID é baseado no conteúdo. 
    // Se o valor ou vencimento mudar, permitimos um NOVO job na fila.
    const contentHash = Buffer.from(`${data.valor}-${data.dataVencimento}`).toString('base64').replace(/=/g, '');
    const jobId = `pix-${data.cobrancaId}-${contentHash}`;
    
    try {
        await pixQueue.add('register-pix', { ...data, txid: data.txid || jobId.replace('pix-', '') }, {
            jobId, 
            removeOnComplete: true,
            attempts: 5, // Tenta várias vezes se a API do Inter falhar
            backoff: {
                type: 'exponential',
                delay: 2000 // 2s, 4s, 8s, 16s...
            }
        });
        logger.debug({ jobId }, "[Queue] Job added to pix-queue");
    } catch (error: any) {
        logger.error({ error: error.message }, "[Queue] Failed to add job to pix-queue");
        throw error;
    }
};
