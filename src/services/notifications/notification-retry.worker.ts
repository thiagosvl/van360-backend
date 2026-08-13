import { logger } from "../../config/logger.js";
import { notificationQueueRepository, NotificationQueueItemPayload } from "../../repositories/notification-queue.repository.js";
import { notificationService } from "./notification.service.js";
import { NotificationQueueService, notificationQueueService } from "./notification-queue.service.js";

export class NotificationRetryWorker {

    /**
     * Executa o reprocessamento de um lote de notificações pendentes
     */
    async processPendingRetries(limit = 20): Promise<number> {
        let processedCount = 0;

        try {
            const pendingItems = await notificationQueueRepository.findPendingRetryItems(limit);
            if (pendingItems.length === 0) return 0;

            logger.info({ count: pendingItems.length }, "[NotificationRetryWorker] Iniciando reprocessamento de notificações pendentes...");

            for (const item of pendingItems) {
                if (!item.id) continue;

                // 1. Bloqueia item trocando status para PROCESSING (Trava de concorrência)
                const locked = await notificationQueueRepository.markAsProcessing(item.id);
                if (!locked) continue;

                const currentAttempts = (item.tentativas || 0) + 1;
                const maxAttempts = item.max_tentativas || 3;

                try {
                    // 2. Checagem de Elegibilidade via Serviço de Domínio (SRP / IoC)
                    const eligibility = await notificationQueueService.checkEligibility(item);
                    if (!eligibility.eligible) {
                        await notificationQueueRepository.markAsCancelled(item.id, eligibility.cancelReason || "Item inelegível para reenvio.");
                        logger.info({ id: item.id, reason: eligibility.cancelReason }, "[NotificationRetryWorker] Retentativa cancelada por inelegibilidade.");
                        continue;
                    }

                    // 3. Tenta disparar a notificação diretamente no canal
                    const sendResult = await notificationService.sendDirect(
                        item.canal,
                        item.evento,
                        { ...item.payload, to: item.destinatario },
                        { usuarioId: item.usuario_id || undefined }
                    );

                    if (sendResult.success) {
                        await notificationQueueRepository.markAsSent(item.id, sendResult.providerMessageId);
                        processedCount++;
                        logger.info({ id: item.id, canal: item.canal, tentativas: currentAttempts }, "[NotificationRetryWorker] Retentativa enviada com sucesso!");
                    } else {
                        const errorMsg = sendResult.error || "Erro ao disparar via provedor";
                        await this.handleFailedAttempt(item, currentAttempts, maxAttempts, errorMsg);
                    }
                } catch (error: unknown) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    await this.handleFailedAttempt(item, currentAttempts, maxAttempts, errorMsg);
                }
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error({ error: msg }, "[NotificationRetryWorker] Falha durante o ciclo de retentativas.");
        }

        return processedCount;
    }

    private async handleFailedAttempt(
        item: NotificationQueueItemPayload,
        currentAttempts: number,
        maxAttempts: number,
        errorMessage: string
    ): Promise<void> {
        if (!item.id) return;

        const errDetail = `${errorMessage} (Tentativa ${currentAttempts}/${maxAttempts})`;

        if (currentAttempts >= maxAttempts) {
            await notificationQueueRepository.markAsFailed(item.id, currentAttempts, errDetail);
            logger.warn({ id: item.id, tentativas: currentAttempts, error: errDetail }, "[NotificationRetryWorker] Número máximo de tentativas atingido. Marcado como FAILED.");
        } else {
            const nextRetryDate = NotificationQueueService.calculateNextRetryDate(currentAttempts + 1);
            await notificationQueueRepository.markAsRetryPending(item.id, currentAttempts, nextRetryDate, errDetail);
            logger.info({ id: item.id, tentativas: currentAttempts, nextRetry: nextRetryDate }, "[NotificationRetryWorker] Falha temporária. Agendada próxima retentativa.");
        }
    }
}

export const notificationRetryWorker = new NotificationRetryWorker();
