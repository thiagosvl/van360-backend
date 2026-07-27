import { logger } from "../config/logger.js";
import { createQueue } from "./index.js";

export const QUEUE_NAME_BIRTHDAY = 'birthday-queue';

export const birthdayQueue = createQueue(QUEUE_NAME_BIRTHDAY);

export interface BirthdayJobData {
    motoristaId: string;
    telefone: string;
    nomeMotorista: string;
    mesAtual: number;
    diaAtual: number;
}

export const addToBirthdayQueue = async (data: BirthdayJobData) => {
    const jobId = `birthday-${data.motoristaId}-${data.mesAtual}-${data.diaAtual}`;
    
    try {
        await birthdayQueue.add('check-birthdays', data, {
            jobId, 
            removeOnComplete: true
        });
        logger.debug({ jobId }, "[Queue] Job added to birthday-queue");
    } catch (error: any) {
        logger.error({ error: error.message }, "[Queue] Failed to add job to birthday-queue");
        throw error;
    }
};
