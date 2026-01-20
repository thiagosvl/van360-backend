import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { getUserProfile } from "../services/profile.service.js";

export const ProfileController = {
    async getProfile(request: FastifyRequest, reply: FastifyReply) {
        const userId = (request as any).user?.id;
        if (!userId) {
            return reply.status(401).send({ error: "Usuário não autenticado." });
        }

        try {
            const profile = await getUserProfile(userId);
            return reply.status(200).send(profile);
        } catch (err: any) {
            if (err.statusCode) {
                 return reply.status(err.statusCode).send({ error: err.message });
            }
            logger.error({ error: err.message, userId }, "Erro ao buscar perfil.");
            return reply.status(500).send({ error: "Erro interno ao buscar perfil." });
        }
    }
};
