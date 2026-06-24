import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { atualizarUsuario, atualizarPixUsuario, validarAcessoUsuario, atualizarCanalAquisicao } from "../services/usuario.service.js";
import { TipoChavePix } from "../types/enums.js";

// Extender FastifyRequest para incluir User
interface AuthenticatedRequest extends FastifyRequest {
    user?: {
        id: string;
        [key: string]: any;
    };
}

export const UsuarioController = {
    async atualizarUsuario(request: FastifyRequest, reply: FastifyReply) {
        const { id: usuarioId } = request.params as { id: string };
        const payload = request.body as { 
            nome?: string; 
            apelido?: string; 
            telefone?: string; 
            assinatura_digital_url?: string;
            config_contrato?: any;
        };
        const authUid = (request as AuthenticatedRequest).user?.id;

        if (authUid) {
            const temAcesso = await validarAcessoUsuario(authUid, usuarioId);
            if (!temAcesso) {
                 return reply.status(403).send({ error: "Acesso negado." });
            }
        }

        try {
            await atualizarUsuario(usuarioId, payload);
            return reply.status(200).send({ success: true });
        } catch (err: any) {
             logger.error({ error: err.message, usuarioId }, "Falha ao atualizar usuário.");
            return reply.status(400).send({ error: err.message });
        }
    },

    async atualizarPixUsuario(request: FastifyRequest, reply: FastifyReply) {
        const { id: usuarioId } = request.params as { id: string };
        const payload = request.body as { 
            chave_pix: string | null;
            tipo_chave_pix: TipoChavePix | null;
        };
        const authUid = (request as AuthenticatedRequest).user?.id;

        if (authUid) {
            const temAcesso = await validarAcessoUsuario(authUid, usuarioId);
            if (!temAcesso) {
                 return reply.status(403).send({ error: "Acesso negado." });
            }
        }

        try {
            await atualizarPixUsuario(usuarioId, payload);
            return reply.status(200).send({ success: true });
        } catch (err: any) {
             logger.error({ error: err.message, usuarioId }, "Falha ao atualizar Pix do usuário.");
            return reply.status(400).send({ error: err.message });
        }
    },

    async atualizarCanalAquisicao(request: FastifyRequest, reply: FastifyReply) {
        const { id: usuarioId } = request.params as { id: string };
        const payload = request.body as { 
            canal_aquisicao: string;
        };
        const authUid = (request as AuthenticatedRequest).user?.id;

        if (authUid) {
            const temAcesso = await validarAcessoUsuario(authUid, usuarioId);
            if (!temAcesso) {
                 return reply.status(403).send({ error: "Acesso negado." });
            }
        }

        try {
            await atualizarCanalAquisicao(usuarioId, payload.canal_aquisicao);
            return reply.status(200).send({ success: true });
        } catch (err: any) {
             logger.error({ error: err.message, usuarioId }, "Falha ao atualizar canal de aquisição do usuário.");
            return reply.status(400).send({ error: err.message });
        }
    },

};
