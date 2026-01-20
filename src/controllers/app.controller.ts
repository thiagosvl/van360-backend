import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { checkAppUpdates } from "../services/app.service.js";

export const AppController = {
    async checkUpdates(request: FastifyRequest, reply: FastifyReply) {
        const { platform } = request.query as { platform: string };

        if (!platform) {
            return reply.status(400).send({ error: "Platform query param is required." });
        }

        try {
            const update = await checkAppUpdates(platform);
            return reply.status(200).send(update || null);
        } catch (err: any) {
            logger.error({ error: err.message, platform }, "Erro ao buscar updates.");
            return reply.status(500).send({ error: "Erro interno." });
        }
    }
};
