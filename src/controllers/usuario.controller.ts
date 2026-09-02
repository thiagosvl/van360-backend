import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { atualizarUsuario, atualizarPixUsuario, validarAcessoUsuario, atualizarCanalAquisicao } from "../services/usuario.service.js";
import { TipoChavePix } from "../types/enums.js";



export const UsuarioController = {
    async atualizarUsuario(request: FastifyRequest, reply: FastifyReply) {
        const { id: usuarioId } = request.params as { id: string };
        const payload = request.body as { 
            nome?: string; 
            razao_social?: string | null;
            apelido?: string | null; 
            telefone?: string; 
            assinatura_digital_url?: string | null;
            config_contrato?: Record<string, unknown> | null;
            data_nascimento?: string | null;
        };
        const authUid = request.user?.id;

        if (authUid) {
            const temAcesso = await validarAcessoUsuario(authUid, usuarioId);
            if (!temAcesso) {
                 return reply.status(403).send({ error: "Acesso negado." });
            }
        }

        try {
            await atualizarUsuario(usuarioId, payload);
            return reply.status(200).send({ success: true });
        } catch (err: unknown) {
            const error = err as Error;
            logger.error({ error: error.message, usuarioId }, "Falha ao atualizar usuário.");
            return reply.status(400).send({ error: error.message });
        }
    },

    async atualizarPixUsuario(request: FastifyRequest, reply: FastifyReply) {
        const { id: usuarioId } = request.params as { id: string };
        const payload = request.body as { 
            chave_pix: string | null;
            tipo_chave_pix: TipoChavePix | null;
        };
        const authUid = request.user?.id;

        if (authUid) {
            const temAcesso = await validarAcessoUsuario(authUid, usuarioId);
            if (!temAcesso) {
                 return reply.status(403).send({ error: "Acesso negado." });
            }
        }

        try {
            await atualizarPixUsuario(usuarioId, payload);
            return reply.status(200).send({ success: true });
        } catch (err: unknown) {
            const error = err as Error;
            logger.error({ error: error.message, usuarioId }, "Falha ao atualizar Pix do usuário.");
            return reply.status(400).send({ error: error.message });
        }
    },

    async atualizarCanalAquisicao(request: FastifyRequest, reply: FastifyReply) {
        const { id: usuarioId } = request.params as { id: string };
        const payload = request.body as { 
            canal_aquisicao: string;
        };
        const authUid = request.user?.id;

        if (authUid) {
            const temAcesso = await validarAcessoUsuario(authUid, usuarioId);
            if (!temAcesso) {
                 return reply.status(403).send({ error: "Acesso negado." });
            }
        }

        try {
            await atualizarCanalAquisicao(usuarioId, payload.canal_aquisicao);
            return reply.status(200).send({ success: true });
        } catch (err: unknown) {
            const error = err as Error;
            logger.error({ error: error.message, usuarioId }, "Falha ao atualizar canal de aquisição do usuário.");
            return reply.status(400).send({ error: error.message });
        }
    },

};
