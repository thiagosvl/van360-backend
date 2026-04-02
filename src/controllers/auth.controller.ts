import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { registrarUsuario, loginResponsavel, login as loginService, logout as logoutService, refreshToken as refreshTokenService, resetPassword as resetPasswordService, updatePassword as updatePasswordService, solicitarRecuperacaoWhatsapp, validarCodigoWhatsApp, resetarSenhaComCodigo } from "../services/auth.service.js";

interface RegisterPayload {
    nome: string;
    apelido?: string;
    cpfcnpj: string;
    email: string;
    telefone: string;
    senha: string;
    termos_aceitos: boolean;
}

export const AuthController = {

    async registrar(request: FastifyRequest, reply: FastifyReply) {
        logger.info("AuthController.registrar - Starting");
        const payload = request.body as RegisterPayload;

        if (!payload.email || !payload.senha || !payload.nome || !payload.cpfcnpj) {
            return reply.status(400).send({ error: "Dados de registro incompletos." });
        }

        if (!payload.termos_aceitos) {
            return reply.status(400).send({ error: "É necessário aceitar os Termos de Uso e a Política de Privacidade." });
        }

        try {
            const result = await registrarUsuario(payload);
            return reply.status(200).send({
                success: true,
                session: result.session,
            });
        } catch (err: any) {
            logger.error(
                { error: err.message, payload: { email: payload.email } },
                "Falha no Endpoint de Cadastro."
            );
            const status = err.statusCode || (err.message.includes("já está em uso") ? 409 : 400);
            return reply.status(status).send({ error: err.message, field: err.field });
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
            const usuarioId = (request as any).usuario_id;
            await logoutService(token, usuarioId);
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
    },

    async solicitarRecuperacao(request: FastifyRequest, reply: FastifyReply) {
        const { cpf } = request.body as any;
        if (!cpf) return reply.status(400).send({ error: "CPF é obrigatório." });

        try {
            const result = await solicitarRecuperacaoWhatsapp(cpf);
            return reply.status(200).send({ 
                success: true, 
                message: "Código enviado ao seu WhatsApp.",
                telefoneMascarado: result.telefoneMascarado
            });
        } catch (err: any) {
            const status = err.statusCode || 500;
            return reply.status(status).send({ error: err.message });
        }
    },

    async validarCodigo(request: FastifyRequest, reply: FastifyReply) {
        const { cpf, codigo } = request.body as any;
        if (!cpf || !codigo) return reply.status(400).send({ error: "CPF e Código são obrigatórios." });

        try {
            const result = await validarCodigoWhatsApp(cpf, codigo);
            return reply.status(200).send(result);
        } catch (err: any) {
            const status = err.statusCode || 401;
            return reply.status(status).send({ error: err.message });
        }
    },

    async confirmarReset(request: FastifyRequest, reply: FastifyReply) {
        const { recoveryId, password } = request.body as any;
        if (!recoveryId || !password) return reply.status(400).send({ error: "Dados incompletos." });

        try {
            const session = await resetarSenhaComCodigo(recoveryId, password);
            return reply.status(200).send({ 
                success: true, 
                message: "Senha alterada com sucesso.",
                session 
            });
        } catch (err: any) {
            const status = err.statusCode || 400;
            return reply.status(status).send({ error: err.message });
        }
    }
};
