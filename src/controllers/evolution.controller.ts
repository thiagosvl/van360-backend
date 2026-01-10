import { FastifyReply, FastifyRequest } from "fastify";
import { webhookEvolutionHandler } from "../services/handlers/webhook-evolution.handler.js";

export const evolutionController = {
  webhook: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        const payload = request.body;
        await webhookEvolutionHandler.handle(payload);
        return reply.send({ success: true });
    } catch (err: any) {
        return reply.status(500).send({ error: err.message });
    }
  }
};
