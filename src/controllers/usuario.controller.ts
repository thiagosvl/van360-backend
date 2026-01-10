import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { atualizarUsuario, validarAcessoUsuario } from "../services/usuario.service.js";

// Extender FastifyRequest para incluir User
interface AuthenticatedRequest extends FastifyRequest {
    user?: {
        id: string;
        [key: string]: any;
    };
}

export const UsuarioController = {
    async atualizarUsuario(request: FastifyRequest, reply: FastifyReply) {
        const usuarioId = (request.params as any).id as string;
        const payload = request.body as { 
            nome?: string; 
            apelido?: string; 
            telefone?: string; 
            chave_pix?: string; 
            tipo_chave_pix?: string; 
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
    }
};
