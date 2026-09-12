import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { notificationQueueRepository } from "../repositories/notification-queue.repository.js";

export class SystemCleanupService {

    /**
     * Executa a purga de notificações antigas enviadas (30 dias) e logs de sistema (60 dias)
     */
    async runHousekeepingPurge(): Promise<{ deletedNotifications: number; deletedLogs: number }> {
        logger.info("[SystemCleanupService] Iniciando faxina periódica do banco de dados (Housekeeping Purge)...");

        let deletedNotifications = 0;
        let deletedLogs = 0;

        // 1. Purga de Notificações Concluídas com mais de 30 dias
        try {
            deletedNotifications = await notificationQueueRepository.purgeOldSentNotifications(30);
            logger.info({ deletedNotifications }, "[SystemCleanupService] Notificações antigas concluídas purgadas.");
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error({ error: msg }, "[SystemCleanupService] Falha ao purgar notificações antigas.");
        }

        // 2. Purga de Logs de Sistema/Auditoria com mais de 60 dias
        try {
            const cutoffDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
            const { data } = await supabaseAdmin
                .from("logs_sistema")
                .delete()
                .lte("created_at", cutoffDate)
                .select("id");

            deletedLogs = data ? data.length : 0;
            logger.info({ deletedLogs }, "[SystemCleanupService] Logs de sistema antigos purgados com sucesso.");
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.warn({ error: msg }, "[SystemCleanupService] Tabela logs_sistema não disponível ou vazia.");
        }

        return { deletedNotifications, deletedLogs };
    }
}

export const systemCleanupService = new SystemCleanupService();
