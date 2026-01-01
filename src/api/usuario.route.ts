import { FastifyInstance } from "fastify";
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { atualizarUsuario, cancelarAssinatura, criarAssinaturaProfissionalPersonalizado, desistirCancelarAssinatura, downgradePlano, iniciaRegistroPlanoEssencial, iniciaRegistroPlanoGratuito, iniciarRegistroplanoProfissional, trocarSubplano, upgradePlano } from "../services/usuario.service.js";

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

export default async function usuarioRoute(app: FastifyInstance) {

    app.post("/registrar-plano-gratuito", async (request, reply) => {
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
    });

    app.post("/registrar-plano-essencial", async (request, reply) => {
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
    });

    app.post("/registrar-plano-profissional", async (request, reply) => {
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
    });

    app.delete("/cancelar-assinatura/:id", async (request: any, reply) => {
        const usuarioId = request.params.id;
        const body = request.body;

        try {
            await cancelarAssinatura({
                usuarioId
            });

            reply.status(204).send();

        } catch (error: any) {
            const statusCode = error.message.includes("obrigatório") ? 400 : 500;

            reply.status(statusCode).send({
                error: "Falha ao agendar cancelamento.",
                details: error.message
            });
        }
    });

    app.patch("/desistir-cancelar-assinatura/:id", async (request: any, reply) => {
        const usuarioId = request.params.id;

        try {
            await desistirCancelarAssinatura(usuarioId);

            reply.status(204).send();

        } catch (error: any) {
            const statusCode = error.message.includes("obrigatório") ? 400 : 500;

            reply.status(statusCode).send({
                error: "Falha ao agendar cancelamento.",
                details: error.message
            });
        }
    });

    app.post("/upgrade-plano", async (request: any, reply) => {
        const authUid = request.user?.id;
        const { plano_id, usuario_id } = request.body as { plano_id: string; usuario_id?: string };

        if (!plano_id) {
            return reply.status(400).send({ error: "Plano é obrigatório." });
        }

        let usuarioId = usuario_id;

        // Se não veio no body, buscar pelo auth_uid
        if (!usuarioId && authUid) {
            const { data: usuario, error: usuarioError } = await supabaseAdmin
                .from("usuarios")
                .select("id")
                .eq("auth_uid", authUid)
                .single();

            if (usuarioError || !usuario) {
                return reply.status(404).send({ error: "Usuário não encontrado." });
            }

            usuarioId = usuario.id;
        }

        if (!usuarioId) {
            return reply.status(400).send({ error: "Usuário não identificado." });
        }

        try {
            const result = await upgradePlano(usuarioId, plano_id);

            return reply.status(200).send(result);
        } catch (err: any) {
            logger.error(
                { error: err.message, usuarioId, plano_id },
                "Falha no upgrade de plano."
            );

            const status = err.message.includes("não encontrada") ? 404 : 
                          err.message.includes("não é um upgrade") ? 400 : 500;

            return reply.status(status).send({ error: err.message });
        }
    });

    app.post("/downgrade-plano", async (request: any, reply) => {
        const authUid = request.user?.id;
        const { plano_id, usuario_id } = request.body as { plano_id: string; usuario_id?: string };

        if (!plano_id) {
            return reply.status(400).send({ error: "Plano é obrigatório." });
        }

        let usuarioId = usuario_id;

        // Se não veio no body, buscar pelo auth_uid
        if (!usuarioId && authUid) {
            const { data: usuario, error: usuarioError } = await supabaseAdmin
                .from("usuarios")
                .select("id")
                .eq("auth_uid", authUid)
                .single();

            if (usuarioError || !usuario) {
                return reply.status(404).send({ error: "Usuário não encontrado." });
            }

            usuarioId = usuario.id;
        }

        if (!usuarioId) {
            return reply.status(400).send({ error: "Usuário não identificado." });
        }

        try {
            const result = await downgradePlano(usuarioId, plano_id);

            return reply.status(200).send(result);
        } catch (err: any) {
            logger.error(
                { error: err.message, usuarioId, plano_id },
                "Falha no downgrade de plano."
            );

            const status = err.message.includes("não encontrada") ? 404 : 
                          err.message.includes("não é um downgrade") ? 400 : 500;

            return reply.status(status).send({ error: err.message });
        }
    });

    app.post("/trocar-subplano", async (request: any, reply) => {
        const authUid = request.user?.id;
        const { subplano_id, usuario_id } = request.body as { subplano_id: string; usuario_id?: string };

        if (!subplano_id) {
            return reply.status(400).send({ error: "Subplano é obrigatório." });
        }

        let usuarioId = usuario_id;

        // Se não veio no body, buscar pelo auth_uid
        if (!usuarioId && authUid) {
            const { data: usuario, error: usuarioError } = await supabaseAdmin
                .from("usuarios")
                .select("id")
                .eq("auth_uid", authUid)
                .single();

            if (usuarioError || !usuario) {
                return reply.status(404).send({ error: "Usuário não encontrado." });
            }

            usuarioId = usuario.id;
        }

        if (!usuarioId) {
            return reply.status(400).send({ error: "Usuário não identificado." });
        }

        try {
            const result = await trocarSubplano(usuarioId, subplano_id);

            return reply.status(200).send(result);
        } catch (err: any) {
            logger.error(
                { error: err.message, usuarioId, subplano_id },
                "Falha na troca de subplano."
            );

            const status = err.message.includes("não encontrada") ? 404 : 
                          err.message.includes("não é permitida") ? 400 : 500;

            return reply.status(status).send({ error: err.message });
        }
    });

    app.post("/criar-assinatura-profissional-personalizado", async (request: any, reply) => {
        const authUid = request.user?.id;
        const { quantidade, usuario_id, targetPassengerId } = request.body as { quantidade: number; usuario_id?: string; targetPassengerId?: string };

        if (!quantidade || quantidade < 1) {
            return reply.status(400).send({ error: "Quantidade inválida." });
        }

        let usuarioId = usuario_id;

        // Se não veio no body, buscar pelo auth_uid
        if (!usuarioId && authUid) {
            const { data: usuario, error: usuarioError } = await supabaseAdmin
                .from("usuarios")
                .select("id")
                .eq("auth_uid", authUid)
                .single();

            if (usuarioError || !usuario) {
                return reply.status(404).send({ error: "Usuário não encontrado." });
            }

            usuarioId = usuario.id;
        }

        if (!usuarioId) {
            return reply.status(400).send({ error: "Usuário não identificado." });
        }

        try {
            const result = await criarAssinaturaProfissionalPersonalizado(usuarioId, quantidade, targetPassengerId);
            return reply.status(200).send(result);
        } catch (err: any) {
            logger.error(
                { error: err.message, usuarioId, quantidade },
                "Falha ao criar assinatura personalizada."
            );
            const status = err.message.includes("não encontrado") ? 404 : 400;
            return reply.status(status).send({ error: err.message });
        }
    });



    app.patch("/:id", async (request: any, reply) => {
        const usuarioId = request.params.id as string;
        const payload = request.body as { 
            nome?: string; 
            apelido?: string; 
            telefone?: string; 
            chave_pix?: string; 
            tipo_chave_pix?: string; 
        };
        const authUid = request.user?.id;

        // Segurança básica: Checar se o usuário é ele mesmo ou admin (se houver role)
        // Por enquanto, validamos se o ID passado no param bate com o ID do token ou se buscarmos pelo token bate.
        
        let usuarioIdFinal = usuarioId;

        if (authUid) {
             const { data: usuario } = await supabaseAdmin
                .from("usuarios")
                .select("id")
                .eq("auth_uid", authUid)
                .single();
            
            if (usuario && usuario.id !== usuarioId) {
                // Tentando alterar outro usuário?
                // Se nao tiver role de admin, bloquear.
                // Como não temos role check aqui, assumimos bloqueio.
                return reply.status(403).send({ error: "Acesso negado." });
            }
        }

        try {
            await atualizarUsuario(usuarioId, payload);
            return reply.status(200).send({ success: true });
        } catch (err: any) {
             logger.error(
                { error: err.message, usuarioId },
                "Falha ao atualizar usuário."
            );
            return reply.status(400).send({ error: err.message });
        }
    });

}