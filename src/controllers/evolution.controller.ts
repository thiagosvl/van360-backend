import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { webhookEvolutionHandler } from "../services/handlers/webhook-evolution.handler.js";
import { EvolutionEvent, EvolutionConnectionStatus } from "../types/enums.js";
import { getNowBR, parseLocalDate } from "../utils/date.utils.js";

interface EvolutionPayload {
    event: EvolutionEvent;
    instance: string;
    data: {
        state?: string;
        statusReason?: number;
    } & Record<string, unknown>;
    date_time: string;
}

export const evolutionController = {
    webhook: async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const payload = request.body as EvolutionPayload;
            const params = request.params as { '*': string };

            const { event, instance, data, date_time } = payload;
            const state = data?.state;

            // Identifica se é um webhook rotineiro de conexão (ex: estado OPEN ou CONNECTING)
            const isRoutineConnection =
                (event === EvolutionEvent.CONNECTION_UPDATE || (payload.event as string) === EvolutionEvent._CONNECTION_UPDATE) &&
                (state === EvolutionConnectionStatus.OPEN || state === EvolutionConnectionStatus.CONNECTED || state === "open" || state === "connecting" || !state);

            if (isRoutineConnection) {
                logger.debug({ event, instance, state }, "[EvolutionController] Webhook recebido (rotina)");
            } else {
                logger.info({ event, instance, state }, "[EvolutionController] Webhook recebido");
            }

            // Prevenir processamento de weblogs muito antigos (+2 min)
            if (date_time) {
                const eventDate = parseLocalDate(date_time);
                const now = getNowBR();
                const diffInSeconds = Math.abs(now.getTime() - eventDate.getTime()) / 1000;

                if (diffInSeconds > 120) {
                    return reply.send({ success: true, note: "Dropped old backlog" });
                }
            }

            await webhookEvolutionHandler.handle(payload);
            return reply.send({ success: true });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Internal Server Error";
            logger.error({ err: message }, "Erro no processamento do webhook");
            return reply.status(500).send({ error: message });
        }
    }
};
