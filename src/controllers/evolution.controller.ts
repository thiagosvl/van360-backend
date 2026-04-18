import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { webhookEvolutionHandler } from "../services/handlers/webhook-evolution.handler.js";
import { EvolutionEvent } from "../types/enums.js";
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

        // Log principal (visibilidade garantida)
        logger.info({ 
            event: payload.event || params['*'], 
            instance: payload.instance 
        }, "[EvolutionController] Webhook recebido");
        
        // Se a Evolution mandou via sub-rota (*), extraímos o evento da URL
        if (params['*'] && !payload.event) {
            const eventFromUrl = params['*'].replace(/-/g, '.');
            payload.event = eventFromUrl as EvolutionEvent;
        }

        const { event, instance, date_time } = payload;
      
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
