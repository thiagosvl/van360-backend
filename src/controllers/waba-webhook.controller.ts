import { FastifyRequest, FastifyReply } from "fastify";
import { logger } from "../config/logger.js";
import { notificationQueueRepository } from "../repositories/notification-queue.repository.js";

import { env } from "../config/env.js";

export class WabaWebhookController {
    /**
     * Validação inicial do Webhook da Meta (GET /api/webhooks/waba)
     */
    async verify(request: FastifyRequest, reply: FastifyReply): Promise<void> {
        const query = request.query as Record<string, string | undefined>;
        const mode = query["hub.mode"];
        const token = query["hub.verify_token"];
        const challenge = query["hub.challenge"];

        if (mode === "subscribe" && token === env.WABA_WEBHOOK_VERIFY_TOKEN) {
            logger.info("[WabaWebhookController] Webhook da Meta verificado com sucesso!");
            return reply.status(200).type("text/plain").send(challenge || "");
        }

        logger.warn({ mode, receivedToken: token }, "[WabaWebhookController] Falha na verificação do Webhook da Meta (Token inválido)");
        return reply.status(403).send("Forbidden");
    }

    /**
     * Recebimento de eventos assíncronos da Meta (POST /api/webhooks/waba)
     */
    async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
        // Responde 200 OK imediatamente para a Meta não reenviar o webhook
        reply.status(200).send({ status: "EVENT_RECEIVED" });

        try {
            const body = request.body as Record<string, unknown>;
            if (!body || body.object !== "whatsapp_business_account") {
                return;
            }

            const entries = (body.entry as Array<Record<string, unknown>>) || [];
            for (const entry of entries) {
                const changes = (entry.changes as Array<Record<string, unknown>>) || [];
                for (const change of changes) {
                    const value = change.value as Record<string, unknown> | undefined;
                    if (!value) continue;

                    const statuses = (value.statuses as Array<Record<string, unknown>>) || [];
                    for (const st of statuses) {
                        const wamid = st.id as string | undefined;
                        const statusStr = st.status as string | undefined;

                        if (!wamid || !statusStr) continue;

                        if (statusStr === "failed") {
                            const errors = (st.errors as Array<Record<string, unknown>>) || [];
                            const firstErr = errors[0];
                            const errCode = firstErr?.code ? `(#${firstErr.code}) ` : "";
                            const errTitle = (firstErr?.title || firstErr?.message || "Message undelivered") as string;
                            const errDetails = (firstErr?.error_data as Record<string, string> | undefined)?.details || errTitle;

                            const fullErrLog = `Meta Webhook Error ${errCode}${errDetails}`;

                            logger.warn({ wamid, error: fullErrLog }, "[WabaWebhookController] Webhook registrou erro de entrega no celular!");

                            await notificationQueueRepository.markAsWebhookFailed(wamid, fullErrLog);
                        } else if (statusStr === "delivered" || statusStr === "read") {
                            logger.info({ wamid, status: statusStr }, "[WabaWebhookController] Webhook confirmou entrega/leitura");
                            await notificationQueueRepository.touchUpdatedTimestampByProviderMessageId(wamid);
                        }
                    }
                }
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error({ error: msg }, "[WabaWebhookController] Erro ao processar webhook da Meta WABA");
        }
    }
}

export const wabaWebhookController = new WabaWebhookController();
