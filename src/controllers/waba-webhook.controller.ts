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
        logger.info({ body: request.body }, "[WabaWebhookController] Recebida chamada POST do Webhook da Meta WABA");
        reply.status(200).send({ status: "EVENT_RECEIVED" });

        try {
            const body = request.body as Record<string, unknown>;
            if (!body) return;

            const valuesToProcess: Array<Record<string, unknown>> = [];

            if (Array.isArray(body.entry)) {
                for (const entry of body.entry as Array<Record<string, unknown>>) {
                    if (Array.isArray(entry.changes)) {
                        for (const change of entry.changes as Array<Record<string, unknown>>) {
                            if (change.value && typeof change.value === "object") {
                                valuesToProcess.push(change.value as Record<string, unknown>);
                            }
                        }
                    }
                }
            } else if (body.value && typeof body.value === "object") {
                valuesToProcess.push(body.value as Record<string, unknown>);
            }

            for (const value of valuesToProcess) {
                // Erros de nível de sistema / conta da Meta (entry.changes.value.errors)
                const globalErrors = (value.errors as Array<Record<string, unknown>>) || [];
                for (const err of globalErrors) {
                    const errCode = err.code ? `(#${err.code}) ` : "";
                    const errTitle = (err.title || err.message || "WABA Account/System Error") as string;
                    const errDetails = (err.error_data as Record<string, string> | undefined)?.details || errTitle;
                    logger.error({ error: `Meta Global Webhook Error ${errCode}${errDetails}` }, "[WabaWebhookController] Erro de nível de conta/sistema retornado pela Meta!");
                }

                // Statuses de mensagens enviadas (entry.changes.value.statuses)
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
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error({ error: msg }, "[WabaWebhookController] Erro ao processar webhook da Meta WABA");
        }
    }
}

export const wabaWebhookController = new WabaWebhookController();
