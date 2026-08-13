import { addToQueue, EvolutionJobData } from "../../../../queues/evolution.queue.js";
import { EvolutionConnectionStatus, NotificationChannelEnum, EvolutionPurpose } from "../../../../types/enums.js";
import { CompositeMessagePart } from "../../../../types/dtos/evolution.dto.js";
import { logger } from "../../../../config/logger.js";
import { evolutionService } from "../../../evolution.service.js";
import { NotificationProviderPort, NotificationSendResult } from "../../ports/notification-provider.port.js";
import { NotificationOptions } from "../../notification.service.js";
import { EvolutionMapper } from "./evolution.mapper.js";
import { env } from "../../../../config/env.js";

export class EvolutionQueueAdapter implements NotificationProviderPort {

    async send(eventName: string, contextData: Record<string, unknown>, options?: NotificationOptions): Promise<NotificationSendResult> {
        const to = contextData.to || "";
        const parts = EvolutionMapper.getTemplate(eventName, contextData);

        if (!parts || parts.length === 0) {
            const err = `[EvolutionQueueAdapter] Nenhum template gerado para o evento '${eventName}'.`;
            logger.debug({ eventName }, err);
            return { success: false, error: err };
        }

        if (env.NODE_ENV !== 'production') {
            parts.forEach((part: CompositeMessagePart) => {
                if (part.type === "text" && part.content && !part.content.startsWith("[DEV]")) {
                    part.content = `[DEV]\n${part.content}`;
                }
            });
        }

        const targetPhone = (to || (contextData?.to as string) || "") as string;

        const compositeSuccess = await this.sendComposite(targetPhone, parts, {
            eventType: eventName,
            instanceName: options?.evolution?.instanceName,
            jobId: options?.jobId,
            metadata: options?.metadata
        });

        return compositeSuccess ? { success: true } : { success: false, error: "[EvolutionQueueAdapter] Falha ao enfileirar mensagem Evolution" };
    }

    async sendComposite(to: string, parts: CompositeMessagePart[], options?: { eventType?: string, instanceName?: string, jobId?: string, metadata?: Record<string, unknown> }): Promise<boolean> {
        if (!to) {
            return false;
        }

        const instanceName = options?.instanceName || "Van360";

        try {
            const instance = await evolutionService.getInstanceStatus(instanceName);
            const status = instance?.state;

            if (status !== EvolutionConnectionStatus.OPEN) {
                logger.warn({ instanceName, status }, "[EvolutionQueueAdapter] Instância offline, a fila tentará o envio quando conectar.");
            }
        } catch (e) {
            logger.error({ instanceName }, "[EvolutionQueueAdapter] Erro ao verificar instância para disparo, enfileirando mesmo assim.");
        }

        try {
            for (const part of parts) {
                const jobData: EvolutionJobData = {
                    phone: to,
                    message: part.type === "text" ? String(part.content || "") : "", // Fallback
                    compositeMessage: [part], // Enviamos a parte estruturada para o Worker processar
                    options: {
                        delay: 1000 // Atraso padrão entre partes da mensagem
                    },
                    context: options?.eventType || 'composite',
                    userId: 'sistema',
                    purpose: EvolutionPurpose.TRANSACTIONAL
                };

                const partJobId = options?.jobId ? `${options.jobId}-part-${parts.indexOf(part)}` : undefined;
                await addToQueue(jobData, partJobId);
            }

            return true;
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error({ error: msg, to, instanceName }, "[EvolutionQueueAdapter] Falha ao enfileirar");
            return false;
        }
    }
}
