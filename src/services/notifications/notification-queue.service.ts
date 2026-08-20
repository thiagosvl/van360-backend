import { logger } from "../../config/logger.js";
import { notificationQueueRepository, NotificationQueueItemPayload } from "../../repositories/notification-queue.repository.js";
import { cobrancaRepository } from "../../repositories/cobranca.repository.js";
import { NotificationChannelEnum, NotificationQueueStatus, CobrancaStatus } from "../../types/enums.js";
import { notificationService, NotificationOptions } from "./notification.service.js";
import { usuarioPushTokenRepository } from "../../repositories/usuario-push-token.repository.js";
import { EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO, EVENTO_PASSAGEIRO_VENCIMENTO_HOJE, EVENTO_PASSAGEIRO_ATRASADO, EVENTO_PASSAGEIRO_RECIBO_PAGAMENTO } from "../../config/constants.js";


export interface EnqueueNotificationParams {
    canal: NotificationChannelEnum;
    evento: string;
    destinatario: string;
    payload: Record<string, unknown>;
    options?: NotificationOptions;
    usuarioId?: string;
}

export class NotificationQueueService {

    static sanitizeRecipient(destinatario: string, canal: NotificationChannelEnum): string {
        if (!destinatario) return "";
        if (canal === NotificationChannelEnum.WABA) {
            return destinatario.replace(/\D/g, "");
        }
        if (canal === NotificationChannelEnum.RESEND) {
            return destinatario.trim().toLowerCase();
        }
        return destinatario.trim();
    }

    static calculateNextRetryDate(attemptNumber: number): string {
        const now = Date.now();
        let delayMinutes = 2;

        if (attemptNumber === 2) {
            delayMinutes = 15;
        } else if (attemptNumber >= 3) {
            delayMinutes = 60;
        }

        return new Date(now + delayMinutes * 60 * 1000).toISOString();
    }

    private async validateCobrancaEligibility(cobrancaId: string, evento: string): Promise<{ eligible: boolean; cancelReason?: string }> {
        const { data: cobranca } = await cobrancaRepository.getByIdBasic(cobrancaId);

        if (!cobranca) {
            return { eligible: false, cancelReason: "Cobrança foi excluída." };
        }

        if ((cobranca as any).desativar_lembretes) {
            return { eligible: false, cancelReason: "Lembretes desativados para esta cobrança." };
        }

        if (evento === EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO || evento === EVENTO_PASSAGEIRO_VENCIMENTO_HOJE || evento === EVENTO_PASSAGEIRO_ATRASADO) {
            if (cobranca.status === CobrancaStatus.PAGO) {
                return { eligible: false, cancelReason: "Cobrança já foi paga pelo responsável." };
            }
        }

        if (evento === EVENTO_PASSAGEIRO_RECIBO_PAGAMENTO) {
            if (cobranca.status !== CobrancaStatus.PAGO) {
                return { eligible: false, cancelReason: "Pagamento da cobrança não está mais confirmado." };
            }
        }

        return { eligible: true };
    }

    private validateRouteEventTTL(evento: string, createdAtStr?: string): { eligible: boolean; cancelReason?: string } {
        if (!evento.startsWith("ROTA_")) return { eligible: true };

        const createdAt = new Date(createdAtStr || Date.now()).getTime();
        const ageMinutes = (Date.now() - createdAt) / (1000 * 60);
        if (ageMinutes > 30) {
            return { eligible: false, cancelReason: "Notificação operacional de rota expirada (mais de 30 minutos)." };
        }

        return { eligible: true };
    }

    async checkEligibility(item: NotificationQueueItemPayload): Promise<{ eligible: boolean; cancelReason?: string }> {
        const payload = item.payload || {};
        const cobrancaId = (payload.cobrancaId || (payload.metadata as Record<string, unknown> | undefined)?.cobrancaId) as string | undefined;

        if (cobrancaId) {
            const cobrancaCheck = await this.validateCobrancaEligibility(cobrancaId, item.evento);
            if (!cobrancaCheck.eligible) return cobrancaCheck;
        }

        const routeCheck = this.validateRouteEventTTL(item.evento, item.created_at);
        if (!routeCheck.eligible) return routeCheck;

        if (item.canal === NotificationChannelEnum.FIREBASE) {
            const isPassengerEvent = item.evento.startsWith("PASSAGEIRO_") || item.evento.startsWith("ROTA_");
            const targetId = isPassengerEvent
                ? (item.destinatario || (payload.to as string))
                : (item.usuario_id || (payload.usuarioId as string) || item.destinatario);

            if (targetId) {
                const tokenCount = await usuarioPushTokenRepository.countTokensByUsuarioId(targetId);
                if (tokenCount === 0) {
                    return { eligible: false, cancelReason: "Usuário não possui tokens de push ativos." };
                }
            }
        }

        if (item.canal === NotificationChannelEnum.RESEND) {
            const email = item.destinatario || (payload.email as string);
            if (!email || !email.includes("@")) {
                return { eligible: false, cancelReason: "Destinatário sem e-mail válido." };
            }
        }

        return { eligible: true };
    }

    async enqueueAndProcess(params: EnqueueNotificationParams): Promise<boolean> {
        const cleanDest = NotificationQueueService.sanitizeRecipient(params.destinatario, params.canal);
        if (!cleanDest) {
            logger.warn({ evento: params.evento, canal: params.canal }, "[NotificationQueueService] Destinatário inválido ou vazio. Ignorando enfileiramento.");
            return false;
        }

        let queueItem: NotificationQueueItemPayload;

        try {
            queueItem = await notificationQueueRepository.create({
                usuario_id: params.usuarioId || (params.payload.usuarioId as string) || (params.options?.usuarioId as string) || null,
                canal: params.canal,
                evento: params.evento,
                destinatario: cleanDest,
                status: NotificationQueueStatus.PENDING,
                tentativas: 0,
                max_tentativas: 3,
                proxima_tentativa_em: new Date().toISOString(),
                payload: params.payload
            });
        } catch (dbError: unknown) {
            const msg = dbError instanceof Error ? dbError.message : String(dbError);
            logger.error({ error: msg, evento: params.evento }, "[NotificationQueueService] Falha ao persistir item na fila.");
            return false;
        }

        // Fast Path: Tenta disparo imediato no provedor
        let lastErrorMsg = "Falha no Fast Path";
        try {
            const sendResult = await notificationService.sendDirect(
                params.canal,
                params.evento,
                { ...params.payload, to: cleanDest },
                params.options
            );

            if (sendResult.success && queueItem.id) {
                await notificationQueueRepository.markAsSent(queueItem.id, sendResult.providerMessageId);
                return true;
            } else if (sendResult.error) {
                lastErrorMsg = sendResult.error;
            }
        } catch (sendError: unknown) {
            lastErrorMsg = sendError instanceof Error ? sendError.message : String(sendError);
            logger.warn({ error: lastErrorMsg, id: queueItem.id, canal: params.canal }, "[NotificationQueueService] Fast Path falhou. Agendando retentativa.");
        }

        // Se o Fast Path falhar, atualiza para RETRY_PENDING (1ª tentativa)
        if (queueItem.id) {
            const nextRetryDate = NotificationQueueService.calculateNextRetryDate(1);
            const errLog = `${lastErrorMsg} (Tentativa 1/3)`;
            await notificationQueueRepository.markAsRetryPending(queueItem.id, 1, nextRetryDate, errLog);
        }

        return false;
    }
}

export const notificationQueueService = new NotificationQueueService();
