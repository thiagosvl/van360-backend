import { FastifyInstance } from "fastify";
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { passageiroService } from "../services/passageiro.service.js";
import { cancelarAssinatura, confirmarDowngradeComSelecao, criarAssinaturaCompletoPersonalizado, desistirCancelarAssinatura, downgradePlano, gerarPixAposSelecaoManual, iniciaRegistroPlanoEssencial, iniciaRegistroPlanoGratuito, iniciarRegistroPlanoCompleto, trocarSubplano, upgradePlano } from "../services/usuario.service.js";

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

    app.post("/registrar-plano-completo", async (request, reply) => {
        const payload = request.body as RegisterPayload;

        if (!payload.email || !payload.senha || !payload.plano_id) {
            return reply.status(400).send({ error: "Dados de registro incompletos." });
        }

        try {
            const result = await iniciarRegistroPlanoCompleto(payload);

            return reply.status(200).send(result);
        } catch (err: any) {
            logger.error(
                { error: err.message, payload: { email: payload.email, plano: payload.plano_id } },
                "Falha no Endpoint de Cadastro no Plano Completo."
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

    app.post("/criar-assinatura-completo-personalizado", async (request: any, reply) => {
        const authUid = request.user?.id;
        const { quantidade, usuario_id } = request.body as { quantidade: number; usuario_id?: string };

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
            const result = await criarAssinaturaCompletoPersonalizado(usuarioId, quantidade);
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

    app.get("/:id/verificar-selecao-manual-necessaria", async (request: any, reply) => {
        const { id: usuarioId } = request.params as { id: string };
        const authUid = request.user?.id;

        let usuarioIdFinal = usuarioId;

        // Se não veio no params, buscar pelo auth_uid
        if (!usuarioIdFinal && authUid) {
            const { data: usuario, error: usuarioError } = await supabaseAdmin
                .from("usuarios")
                .select("id")
                .eq("auth_uid", authUid)
                .single();

            if (usuarioError || !usuario) {
                return reply.status(404).send({ error: "Usuário não encontrado." });
            }

            usuarioIdFinal = usuario.id;
        }

        if (!usuarioIdFinal) {
            return reply.status(400).send({ error: "Usuário não identificado." });
        }

        try {
            // PRIMEIRO: Verificar se há cobrança pendente de pagamento
            // Só precisa verificar seleção manual se houver cobrança pendente
            const { data: cobrancaPendente, error: cobrancaError } = await supabaseAdmin
                .from("assinaturas_cobrancas")
                .select(`
                    id,
                    assinatura_usuario_id,
                    status,
                    assinaturas_usuarios:assinatura_usuario_id (
                        franquia_contratada_cobrancas,
                        planos:plano_id (
                            slug,
                            parent:parent_id (
                                slug
                            )
                        )
                    )
                `)
                .eq("usuario_id", usuarioIdFinal)
                .eq("status", "pendente_pagamento")
                .maybeSingle();

            // Se não há cobrança pendente, não precisa seleção manual
            if (cobrancaError || !cobrancaPendente) {
                return reply.status(200).send({ precisaSelecaoManual: false });
            }

            const assinaturaPendente = cobrancaPendente.assinaturas_usuarios as any;
            if (!assinaturaPendente) {
                return reply.status(200).send({ precisaSelecaoManual: false });
            }

            const plano = assinaturaPendente.planos as any;
            const slugBase = plano.parent?.slug ?? plano.slug;

            // Só verificar se for plano Completo
            if (slugBase !== "completo") {
                return reply.status(200).send({ precisaSelecaoManual: false });
            }

            const franquia = assinaturaPendente.franquia_contratada_cobrancas || 0;
            const calculo = await passageiroService.calcularPassageirosDisponiveis(usuarioIdFinal, franquia);

            return reply.status(200).send({
                precisaSelecaoManual: calculo.precisaSelecaoManual,
                tipo: "upgrade" as const,
                franquia,
            });
        } catch (err: any) {
            logger.error(
                { error: err.message, usuarioId: usuarioIdFinal },
                "Falha ao verificar se precisa seleção manual."
            );
            return reply.status(500).send({ error: err.message });
        }
    });

    app.get("/:id/passageiros-para-selecao", async (request: any, reply) => {
        const usuarioId = request.params.id as string;
        const { tipo, franquia } = request.query as { tipo: "upgrade" | "downgrade"; franquia: string };

        if (!tipo || !franquia) {
            return reply.status(400).send({ error: "Tipo e franquia são obrigatórios." });
        }

        try {
            const passageiros = await passageiroService.listarPassageirosParaSelecao(
                usuarioId,
                tipo,
                Number(franquia)
            );
            return reply.status(200).send(passageiros);
        } catch (err: any) {
            logger.error(
                { error: err.message, usuarioId, tipo, franquia },
                "Falha ao listar passageiros para seleção."
            );
            return reply.status(400).send({ error: err.message });
        }
    });

    app.post("/:id/salvar-selecao-passageiros", async (request: any, reply) => {
        const usuarioId = request.params.id as string;
        const { 
            cobrancaId,
            passageiroIds, 
            tipo,
            franquia
        } = request.body as { 
            cobrancaId: string;
            passageiroIds: string[]; 
            tipo: "upgrade" | "downgrade";
            franquia: number;
        };

        if (!cobrancaId || !passageiroIds || !Array.isArray(passageiroIds) || !tipo || !franquia) {
            return reply.status(400).send({ error: "cobrancaId, passageiroIds (array), tipo e franquia são obrigatórios." });
        }

        try {
            // Buscar cobrança
            const { data: cobranca, error: cobrancaError } = await supabaseAdmin
                .from("assinaturas_cobrancas")
                .select("id, status, usuario_id")
                .eq("id", cobrancaId)
                .eq("usuario_id", usuarioId)
                .eq("status", "pendente_pagamento")
                .single();

            if (cobrancaError || !cobranca) {
                return reply.status(404).send({ error: "Cobrança não encontrada ou não está pendente." });
            }

            // Salvar seleção na coluna selecao_passageiros_pendente
            const selecaoData = {
                passageiroIds,
                tipo,
                franquia,
                criadoEm: new Date().toISOString()
            };

            const { error: updateError } = await supabaseAdmin
                .from("assinaturas_cobrancas")
                .update({ selecao_passageiros_pendente: selecaoData })
                .eq("id", cobrancaId);

            if (updateError) {
                throw new Error("Erro ao salvar seleção: " + updateError.message);
            }

            return reply.status(200).send({ success: true, cobrancaId });
        } catch (err: any) {
            logger.error(
                { error: err.message, usuarioId, cobrancaId, passageiroIds },
                "Falha ao salvar seleção de passageiros."
            );
            return reply.status(400).send({ error: err.message });
        }
    });

    app.post("/:id/selecionar-passageiros-cobranca-automatica", async (request: any, reply) => {
        const usuarioId = request.params.id as string;
        const { 
            passageiroIds, 
            franquia, 
            tipoDowngrade, 
            subplanoId, 
            quantidadePersonalizada,
            tipo,
            planoId,
            precoAplicado,
            precoOrigem,
            cobrancaId
        } = request.body as { 
            passageiroIds: string[]; 
            franquia: number;
            tipoDowngrade?: "subplano" | "personalizado";
            subplanoId?: string;
            quantidadePersonalizada?: number;
            tipo?: "upgrade" | "downgrade";
            planoId?: string;
            precoAplicado?: number;
            precoOrigem?: string;
            cobrancaId?: string;
        };

        if (!passageiroIds || !Array.isArray(passageiroIds) || !franquia) {
            return reply.status(400).send({ error: "passageiroIds (array) e franquia são obrigatórios." });
        }

        try {
            // Se for downgrade, fazer downgrade E atualizar passageiros de uma vez
            if (tipoDowngrade) {
                const resultado = await confirmarDowngradeComSelecao(
                    usuarioId,
                    passageiroIds,
                    franquia,
                    tipoDowngrade,
                    subplanoId,
                    quantidadePersonalizada
                );
                return reply.status(200).send(resultado);
            } else {
                // Se tiver cobrancaId, salvar seleção na cobrança primeiro
                if (cobrancaId && tipo === "upgrade") {
                    const selecaoData = {
                        passageiroIds,
                        tipo,
                        franquia,
                        criadoEm: new Date().toISOString()
                    };

                    const { error: updateError } = await supabaseAdmin
                        .from("assinaturas_cobrancas")
                        .update({ selecao_passageiros_pendente: selecaoData })
                        .eq("id", cobrancaId)
                        .eq("usuario_id", usuarioId)
                        .eq("status", "pendente_pagamento");

                    if (updateError) {
                        throw new Error("Erro ao salvar seleção: " + updateError.message);
                    }

                    // Gerar PIX após salvar seleção
                    if (precoAplicado !== undefined && precoAplicado > 0) {
                        try {
                            const pixData = await gerarPixAposSelecaoManual(
                                usuarioId,
                                tipo,
                                precoAplicado,
                                precoOrigem || "personalizado",
                                planoId,
                                subplanoId,
                                quantidadePersonalizada,
                                cobrancaId
                            );
                            
                            return reply.status(200).send({
                                success: true,
                                ...pixData,
                            });
                        } catch (pixError: any) {
                            // Se a assinatura já está ativa (pagamento já confirmado), apenas retornar sucesso
                            if (pixError.message.includes("já está ativa")) {
                                logger.info({ usuarioId }, "Assinatura já ativa - não gerando PIX após seleção manual");
                                return reply.status(200).send({ success: true });
                            }
                            // Se for outro erro, propagar
                            throw pixError;
                        }
                    }
                } else {
                    // Atualizar passageiros diretamente (caso de upgrade sem cobrança pendente ou downgrade)
                    const resultado = await passageiroService.confirmarSelecaoPassageiros(
                        usuarioId,
                        passageiroIds,
                        franquia
                    );
                    return reply.status(200).send(resultado);
                }
            }
        } catch (err: any) {
            logger.error(
                { error: err.message, usuarioId, passageiroIds, franquia },
                "Falha ao confirmar seleção de passageiros."
            );
            return reply.status(400).send({ error: err.message });
        }
    });

}