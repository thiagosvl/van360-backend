import { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../errors/AppError.js";
import { getUserProfile } from "../services/profile.service.js";

export const ProfileController = {
    async getProfile(request: FastifyRequest, reply: FastifyReply) {
        const userId = request.user?.id;
        if (!userId) {
            throw new AppError("Usuário não autenticado.", 401);
        }

        const profile = await getUserProfile(userId);
        return reply.status(200).send(profile);
    }
};
