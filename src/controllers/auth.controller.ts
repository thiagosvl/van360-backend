import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { iniciaRegistroPlanoEssencial, iniciaRegistroPlanoGratuito, iniciarRegistroplanoProfissional, loginResponsavel, login as loginService, logout as logoutService, refreshToken as refreshTokenService, resetPassword as resetPasswordService, updatePassword as updatePasswordService } from "../services/auth.service.js";

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
    },

    async login(request: FastifyRequest, reply: FastifyReply) {
        logger.info("AuthController.login - Starting");
        const { identifier, password } = request.body as any;

        if (!identifier || !password) {
            return reply.status(400).send({ error: "E-mail/CPF e senha são obrigatórios." });
        }

        try {
            const result = await loginService(identifier, password);
            return reply.status(200).send(result);
        } catch (err: any) {
            logger.warn({ error: err.message, identifier }, "Falha no Login.");
            const status = err.statusCode || 401; // Default to 401 for login failures
            return reply.status(status).send({ error: err.message });
        }
    },

    async resetPassword(request: FastifyRequest, reply: FastifyReply) {
        logger.info("AuthController.resetPassword - Starting");
        const { identifier, redirectTo } = request.body as any;

        if (!identifier) {
            return reply.status(400).send({ error: "E-mail ou CPF é obrigatório." });
        }

        try {
            await resetPasswordService(identifier, redirectTo);
            return reply.status(200).send({ success: true, message: "E-mail de recuperação enviado." });
        } catch (err: any) {
            logger.error({ error: err.message, identifier }, "Falha na solicitação de recuperação de senha.");
            const status = err.statusCode || 500;
            return reply.status(status).send({ error: err.message || "Erro ao processar solicitação." });
        }
    },

    async loginResponsavel(request: FastifyRequest, reply: FastifyReply) {
        logger.info("AuthController.loginResponsavel - Starting");
        const { cpf, email } = request.body as any;

        if (!cpf || !email) {
            return reply.status(400).send({ error: "CPF e Email são obrigatórios." });
        }

        try {
            const result = await loginResponsavel(cpf, email);
            return reply.status(200).send(result);
        } catch (err: any) {
            logger.warn({ error: err.message, cpf }, "Falha no Login Responsavel.");
            const status = err.statusCode || 401;
            return reply.status(status).send({ error: err.message });
        }
    },

    async updatePassword(request: FastifyRequest, reply: FastifyReply) {
        // Token validation done by middleware, but we need the raw token to pass to service?
        // Actually the service 'updatePassword' I wrote takes 'token' to verify user AGAIN using supabaseAdmin.auth.getUser(token).
        // This is double verification (Middleware does it too).
        // But verifying in Service ensures we use the token's authority.
        // Middleware attaches `req.user`.
        // Ideally we just update `req.user.id`.
        // But `updateUserById` (Admin) is super powerful.
        // If we trust middleware, we can just use `req.user.id`.
        // However, standard flow: Use the token to prove identity.
        // Middleware: `verifySupabaseJWT` checks validity.
        // I'll extract token from header again.

        const authHeader = request.headers.authorization;
        if (!authHeader) return reply.status(401).send({ error: "Token ausente." });
        const token = authHeader.split(" ")[1];

        const { password, oldPassword } = request.body as any;

        if (!password) {
            return reply.status(400).send({ error: "Nova senha é obrigatória." });
        }

        try {
            await updatePasswordService(token, password, oldPassword);
            return reply.status(200).send({ success: true, message: "Senha atualizada com sucesso." });
        } catch (err: any) {
            logger.error({ error: err.message }, "Falha ao atualizar senha.");
            return reply.status(500).send({ error: err.message });
        }
    },

    async logout(request: FastifyRequest, reply: FastifyReply) {
        const authHeader = request.headers.authorization;
        if (authHeader) {
            const token = authHeader.split(" ")[1];
            await logoutService(token);
        }
        return reply.status(200).send({ success: true });
    },

    async refresh(request: FastifyRequest, reply: FastifyReply) {
        logger.info("AuthController.refresh - Starting");
        const { refresh_token } = request.body as any;

        if (!refresh_token) {
            return reply.status(400).send({ error: "Refresh token é obrigatório." });
        }

        try {
            const result = await refreshTokenService(refresh_token);
            return reply.status(200).send(result);
        } catch (err: any) {
            logger.warn({ error: err.message }, "Falha ao renovar token.");
            const status = err.statusCode || 401;
            return reply.status(status).send({ error: err.message });
        }
    }
};
