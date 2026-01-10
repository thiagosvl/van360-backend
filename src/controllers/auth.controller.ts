import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { iniciaRegistroPlanoEssencial, iniciaRegistroPlanoGratuito, iniciarRegistroplanoProfissional } from "../services/auth.service.js";

interface RegisterPayload {
    nome: string;
    apelido?: string;
    cpfcnpj: string;
    email: string;
    telefone: string;
    senha: string;
    plano_id: string;
    sub_plano_id?: string;
}

export const AuthController = {
    async registrarPlanoGratuito(request: FastifyRequest, reply: FastifyReply) {
        logger.info("AuthController.registrarPlanoGratuito - Starting");
        const payload = request.body as RegisterPayload;

        if (!payload.email || !payload.senha || !payload.plano_id) {
            return reply.status(400).send({ error: "Dados de registro incompletos." });
        }

        try {
            const result = await iniciaRegistroPlanoGratuito(payload);
            return reply.status(200).send({
                success: true,
                session: result.session,
            });
        } catch (err: any) {
            logger.error(
                { error: err.message, payload: { email: payload.email, plano: payload.plano_id } },
                "Falha no Endpoint de Cadastro no Plano Gratuito."
            );
            const status = err.message.includes("já está em uso") ? 409 : 400;
            return reply.status(status).send({ error: err.message });
        }
    },

    async registrarPlanoEssencial(request: FastifyRequest, reply: FastifyReply) {
        logger.info("AuthController.registrarPlanoEssencial - Starting");
        const payload = request.body as RegisterPayload;

        if (!payload.email || !payload.senha || !payload.plano_id) {
            return reply.status(400).send({ error: "Dados de registro incompletos." });
        }

        try {
            const result = await iniciaRegistroPlanoEssencial(payload);
            return reply.status(200).send({
                success: true,
                session: result.session,
            });
        } catch (err: any) {
            logger.error(
                { error: err.message, payload: { email: payload.email, plano: payload.plano_id } },
                "Falha no Endpoint de Cadastro no Plano Essencial."
            );
            const status = err.message.includes("já está em uso") ? 409 : 400;
            return reply.status(status).send({ error: err.message });
        }
    },

    async registrarPlanoProfissional(request: FastifyRequest, reply: FastifyReply) {
        logger.info("AuthController.registrarPlanoProfissional - Starting");
        const payload = request.body as RegisterPayload;

        if (!payload.email || !payload.senha || !payload.plano_id) {
            return reply.status(400).send({ error: "Dados de registro incompletos." });
        }

        try {
            const result = await iniciarRegistroplanoProfissional(payload);
            return reply.status(200).send(result);
        } catch (err: any) {
            logger.error(
                { error: err.message, payload: { email: payload.email, plano: payload.plano_id } },
                "Falha no Endpoint de Cadastro no Plano Profissional."
            );
            const status = err.message.includes("já está em uso") ? 409 : 400;
            return reply.status(status).send({ error: err.message });
        }
    }
};
