import { logger } from "../config/logger.js";
import { createQueue } from "./index.js";

export const QUEUE_NAME_CONTRACT = 'contract-queue';

export const contractQueue = createQueue(QUEUE_NAME_CONTRACT);

export interface ContractJobData {
    contratoId: string;
    usuarioId: string;
    providerName: string;
    dadosContrato: any;
    passageiro: {
        id: string;
        nome: string;
        responsavel_principal?: {
            id?: string;
            nome?: string;
            telefone?: string;
            email?: string | null;
        } | null;
        responsaveis?: any[];
    };
    tokenAcesso: string;
}

/**
 * Adiciona um job de geração de contrato na fila.
 */
export const addToContractQueue = async (data: ContractJobData, jobId?: string) => {
    try {
        await contractQueue.add('generate-contract', data, {
            jobId: jobId,
            removeOnComplete: true
        });
        logger.debug({ contratoId: data.contratoId, jobId }, "[Queue] Job added to contract-queue");
    } catch (error: any) {
        logger.error({ error: error.message }, "[Queue] Failed to add job to contract-queue");
        throw error;
    }
};
