import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { registrarUsuario, login as loginService, logout as logoutService, refreshToken as refreshTokenService, updatePassword as updatePasswordService, solicitarRecuperacao, validarCodigo, resetarSenhaComCodigo } from "../services/auth.service.js";
import { RegistrarUsuarioBodyDTO, LoginBodyDTO, UpdatePasswordBodyDTO, ConfirmarResetBodyDTO, ValidarCodigoBodyDTO, RefreshTokenBodyDTO, SolicitarRecuperacaoBodyDTO, } from "../types/dtos/auth.dto.js";
import { extractClientAccessData } from "../utils/request-client.utils.js";
import { errorAlertService } from "../services/error-alert.service.js";


export const AuthController = {

    async registrar(request: FastifyRequest, reply: FastifyReply) {
        logger.info("AuthController.registrar - Starting");
        const payload = request.body as RegistrarUsuarioBodyDTO;

        if (!payload.email || !payload.senha || !payload.nome || !payload.cpfcnpj) {
            return reply.status(400).send({ error: "Dados de registro incompletos." });
        }

        if (!payload.termos_aceitos) {
            return reply.status(400).send({ error: "É necessário aceitar os Termos de Uso e a Política de Privacidade." });
        }

        try {
            const clientAccess = extractClientAccessData(
                request,
                payload.metadados_cadastro,
                payload.dispositivo_cadastro
            );

            const result = await registrarUsuario({
                ...payload,
                dispositivo_cadastro: clientAccess.dispositivoCadastro,
                metadados_cadastro: clientAccess.metadados,
            });
            return reply.status(200).send({
                success: true,
                session: result.session,
            });

        } catch (err: unknown) {
            const errorObj = err as { message?: string; statusCode?: number; field?: string };
            const message = errorObj?.message || "Erro interno no cadastro.";
            const status = errorObj?.statusCode || (message.includes("já está em uso") ? 409 : 400);

            logger.error(
                { error: message, payload: { email: payload.email }, status },
                "Falha no Endpoint de Cadastro."
            );

            if (status >= 500) {
                void errorAlertService.notifyHttpError({
                    error: err,
                    method: request.method,
                    url: request.url,
                    statusCode: status,
                });
            }

            return reply.status(status).send({ error: message, field: errorObj?.field });
        }
    },

    async login(request: FastifyRequest, reply: FastifyReply) {
        logger.info("AuthController.login - Starting");
        const { identifier, password } = (request.body || {}) as LoginBodyDTO;

        if (!identifier || !password) {
            return reply.status(400).send({ error: "E-mail/CPF e senha são obrigatórios." });
        }

        try {
            const clientAccess = extractClientAccessData(request);

            const result = await loginService(identifier, password, {
                ip: clientAccess.ip,
                userAgent: clientAccess.userAgent,
                dispositivo: clientAccess.dispositivo,
            });
            return reply.status(200).send(result);
        } catch (err: any) {
            logger.warn({ error: err.message, identifier }, "Falha no Login.");
            const status = err.statusCode || 401;
            return reply.status(status).send({ error: err.message });
        }
    },
    async updatePassword(request: FastifyRequest, reply: FastifyReply) {
        const authHeader = request.headers.authorization;
        if (!authHeader) return reply.status(401).send({ error: "Token ausente." });
        const token = authHeader.split(" ")[1];

        const { password, oldPassword } = (request.body || {}) as UpdatePasswordBodyDTO;

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
            const usuarioId = request.usuario_id;
            await logoutService(token, usuarioId);
        }
        return reply.status(200).send({ success: true });
    },

    async refresh(request: FastifyRequest, reply: FastifyReply) {
        logger.info("AuthController.refresh - Starting");
        const { refresh_token } = (request.body || {}) as RefreshTokenBodyDTO;

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
        const { cpf, cpfcnpj, documento } = (request.body || {}) as SolicitarRecuperacaoBodyDTO;
        const doc = documento || cpfcnpj || cpf;
        if (!doc) return reply.status(400).send({ error: "CPF/CNPJ é obrigatório." });

        try {
            const result = await solicitarRecuperacao(doc);
            return reply.status(200).send({
                success: true,
                message: "Código enviado por e-mail.",
                emailMascarado: result.emailMascarado
            });
        } catch (err: any) {
            const status = err.statusCode || 500;
            return reply.status(status).send({ error: err.message });
        }
    },

    async validarCodigo(request: FastifyRequest, reply: FastifyReply) {
        const { cpf, cpfcnpj, documento, codigo } = (request.body || {}) as ValidarCodigoBodyDTO;
        const doc = documento || cpfcnpj || cpf;
        if (!doc || !codigo) return reply.status(400).send({ error: "CPF/CNPJ e Código são obrigatórios." });

        try {
            const result = await validarCodigo(doc, codigo);
            return reply.status(200).send(result);
        } catch (err: any) {
            const status = err.statusCode || 401;
            return reply.status(status).send({ error: err.message });
        }
    },

    async confirmarReset(request: FastifyRequest, reply: FastifyReply) {
        const { recoveryId, password } = (request.body || {}) as ConfirmarResetBodyDTO;
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
