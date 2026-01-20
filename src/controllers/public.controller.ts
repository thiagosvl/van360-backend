import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { validateMotoristaPublic } from "../services/public.service.js";

export const PublicController = {
    async validateMotorista(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as { id: string };

        if (!id) {
            return reply.status(400).send({ error: "ID do motorista obrigatório." });
        }

        try {
            const data = await validateMotoristaPublic(id);
            return reply.status(200).send(data);
        } catch (err: any) {
            logger.warn({ error: err.message, motoristaId: id }, "Falha na validação pública de motorista.");
             const status = err.statusCode || 400;
            return reply.status(status).send({ error: err.message });
        }
    }
};
