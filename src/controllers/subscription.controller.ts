import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { subscriptionService } from "../services/subscription.service.js";

// Extender FastifyRequest para incluir User (se não houver type definition global)
interface AuthenticatedRequest extends FastifyRequest {
    user?: {
        id: string;
        [key: string]: any;
    };
}

export const SubscriptionController = {
    async cancelarAssinatura(request: FastifyRequest, reply: FastifyReply) {
        const userIdRaw = (request.params as any).id;
        logger.info({ userIdRaw }, "SubscriptionController.cancelarAssinatura - Starting");
        // O body não é usado no service, mas estava no route original. Mantendo assinatura.
        // const body = request.body;

        try {
            await subscriptionService.cancelarAssinatura({ usuarioId: userIdRaw });
            return reply.status(204).send();
        } catch (error: any) {
            const statusCode = error.message.includes("obrigatório") ? 400 : 500;
            return reply.status(statusCode).send({
                error: "Falha ao agendar cancelamento.",
                details: error.message
            });
        }
    },

    async desistirCancelarAssinatura(request: FastifyRequest, reply: FastifyReply) {
        const usuarioId = (request.params as any).id;
        try {
            await subscriptionService.desistirCancelarAssinatura(usuarioId);
            return reply.status(204).send();
        } catch (error: any) {
            const statusCode = error.message.includes("obrigatório") ? 400 : 500;
            return reply.status(statusCode).send({
                error: "Falha ao agendar cancelamento.", // Mensagem original estava assim, corrigindo? "Falha ao desfazer cancelamento"
                details: error.message
            });
        }
    },

    async upgradePlano(request: FastifyRequest, reply: FastifyReply) {
        const authUid = (request as AuthenticatedRequest).user?.id;
        const { plano_id, usuario_id } = request.body as { plano_id: string; usuario_id?: string };
        logger.info({ plano_id, usuario_id, authUid }, "SubscriptionController.upgradePlano - Starting");

        if (!plano_id) {
            return reply.status(400).send({ error: "Plano é obrigatório." });
        }

        let usuarioId = usuario_id;

        if (!usuarioId && authUid) {
            const { data: usuario, error } = await supabaseAdmin
                .from("usuarios").select("id").eq("auth_uid", authUid).single();
            if (error || !usuario) return reply.status(404).send({ error: "Usuário não encontrado." });
            usuarioId = usuario.id;
        }

        if (!usuarioId) return reply.status(400).send({ error: "Usuário não identificado." });

        try {
            const result = await subscriptionService.upgradePlano(usuarioId, plano_id);
            return reply.status(200).send(result);
        } catch (err: any) {
            logger.error({ error: err.message, usuarioId, plano_id }, "Falha no upgrade de plano.");
            const status = err.message.includes("não encontrada") ? 404 :
                           err.message.includes("não é um upgrade") ? 400 : 500;
            return reply.status(status).send({ error: err.message });
        }
    },

    async downgradePlano(request: FastifyRequest, reply: FastifyReply) {
        const authUid = (request as AuthenticatedRequest).user?.id;
        const { plano_id, usuario_id } = request.body as { plano_id: string; usuario_id?: string };
        logger.info({ plano_id, usuario_id, authUid }, "SubscriptionController.downgradePlano - Starting");

        if (!plano_id) return reply.status(400).send({ error: "Plano é obrigatório." });

        let usuarioId = usuario_id;
        if (!usuarioId && authUid) {
            const { data: usuario, error } = await supabaseAdmin
                .from("usuarios").select("id").eq("auth_uid", authUid).single();
            if (error || !usuario) return reply.status(404).send({ error: "Usuário não encontrado." });
            usuarioId = usuario.id;
        }

        if (!usuarioId) return reply.status(400).send({ error: "Usuário não identificado." });

        try {
            const result = await subscriptionService.downgradePlano(usuarioId, plano_id);
            return reply.status(200).send(result);
        } catch (err: any) {
            logger.error({ error: err.message, usuarioId, plano_id }, "Falha no downgrade de plano.");
            const status = err.message.includes("não encontrada") ? 404 :
                           err.message.includes("não é um downgrade") ? 400 : 500;
            return reply.status(status).send({ error: err.message });
        }
    },

    async trocarSubplano(request: FastifyRequest, reply: FastifyReply) {
        const authUid = (request as AuthenticatedRequest).user?.id;
        const { subplano_id, usuario_id } = request.body as { subplano_id: string; usuario_id?: string };

        if (!subplano_id) return reply.status(400).send({ error: "Subplano é obrigatório." });

        let usuarioId = usuario_id;
        if (!usuarioId && authUid) {
            const { data: usuario, error } = await supabaseAdmin
                .from("usuarios").select("id").eq("auth_uid", authUid).single();
            if (error || !usuario) return reply.status(404).send({ error: "Usuário não encontrado." });
            usuarioId = usuario.id;
        }

        if (!usuarioId) return reply.status(400).send({ error: "Usuário não identificado." });

        try {
            const result = await subscriptionService.trocarSubplano(usuarioId, subplano_id);
            return reply.status(200).send(result);
        } catch (err: any) {
            logger.error({ error: err.message, usuarioId, subplano_id }, "Falha na troca de subplano.");
            const status = err.message.includes("não encontrada") ? 404 :
                           err.message.includes("não é permitida") ? 400 : 500;
            return reply.status(status).send({ error: err.message });
        }
    },

    async criarAssinaturaPersonalizada(request: FastifyRequest, reply: FastifyReply) {
        const authUid = (request as AuthenticatedRequest).user?.id;
        const { quantidade, usuario_id } = request.body as { quantidade: number; usuario_id?: string };

        if (!quantidade || quantidade < 1) return reply.status(400).send({ error: "Quantidade inválida." });

        let usuarioId = usuario_id;
        if (!usuarioId && authUid) {
            const { data: usuario, error } = await supabaseAdmin
                .from("usuarios").select("id").eq("auth_uid", authUid).single();
            if (error || !usuario) return reply.status(404).send({ error: "Usuário não encontrado." });
            usuarioId = usuario.id;
        }

        if (!usuarioId) return reply.status(400).send({ error: "Usuário não identificado." });

        try {
            const result = await subscriptionService.criarAssinaturaProfissionalPersonalizado(usuarioId, quantidade);
            return reply.status(200).send(result);
        } catch (err: any) {
             logger.error({ error: err.message, usuarioId, quantidade }, "Falha ao criar assinatura personalizada.");
             const status = err.message.includes("não encontrado") ? 404 : 400;
             return reply.status(status).send({ error: err.message });
        }
    }
};
