import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { interService } from "./inter.service.js";
import { passageiroService } from "./passageiro.service.js";
import { PLANO_COMPLETO } from "../config/contants.js";
export const assinaturaCobrancaService = {
    async getAssinaturaCobranca(id) {
        const { data, error } = await supabaseAdmin
            .from("assinaturas_cobrancas")
            .select("*")
            .eq("id", id)
            .single();
        if (error)
            throw error;
        return data;
    },
    async listAssinaturaCobrancas(filtros) {
        let query = supabaseAdmin
            .from("assinaturas_cobrancas")
            .select(`*, assinatura_usuarios:assinatura_usuario_id (*, planos:plano_id (*, parent:parent_id (*)))`)
            .order("created_at", { ascending: false });
        if (filtros?.usuarioId) {
            query = query.eq("usuario_id", filtros.usuarioId);
        }
        if (filtros?.assinaturaUsuarioId) {
            query = query.eq("assinatura_usuario_id", filtros.assinaturaUsuarioId);
        }
        const { data, error } = await query;
        if (error)
            throw error;
        return data || [];
    },
    async gerarPixParaCobranca(cobrancaId) {
        // Buscar cobrança com dados do usuário e assinatura
        const { data: cobranca, error: cobrancaError } = await supabaseAdmin
            .from("assinaturas_cobrancas")
            .select(`
                id,
                valor,
                status,
                qr_code_payload,
                inter_txid,
                location_url,
                usuario_id,
                assinatura_usuario_id,
                selecao_passageiros_pendente,
                usuarios:usuario_id (cpfcnpj, nome),
                assinatura_usuarios:assinatura_usuario_id (
                    id,
                    franquia_contratada_cobrancas,
                    planos:plano_id (
                        slug,
                        parent:parent_id (
                            slug
                        )
                    )
                )
            `)
            .eq("id", cobrancaId)
            .single();
        if (cobrancaError || !cobranca) {
            throw new Error("Cobrança não encontrada.");
        }
        if (cobranca.status !== "pendente_pagamento") {
            throw new Error("Esta cobrança não está pendente de pagamento.");
        }
        // Se já existe PIX válido, retornar dados existentes (não precisa verificar seleção manual novamente)
        if (cobranca.qr_code_payload && cobranca.inter_txid) {
            logger.info({ cobrancaId }, "Reutilizando PIX existente para cobrança");
            return {
                qrCodePayload: cobranca.qr_code_payload,
                location: cobranca.location_url || "",
                inter_txid: cobranca.inter_txid,
                cobrancaId: cobranca.id,
            };
        }
        // Verificar se já há seleção salva na cobrança
        const selecaoSalva = cobranca.selecao_passageiros_pendente;
        // Se não há seleção salva, verificar se precisa seleção manual
        if (!selecaoSalva || !selecaoSalva.passageiroIds || selecaoSalva.passageiroIds.length === 0) {
            const assinatura = cobranca.assinatura_usuarios;
            if (assinatura) {
                const plano = assinatura.planos;
                const slugBase = plano.parent?.slug ?? plano.slug;
                // Verificar se é plano Completo e se precisa seleção manual
                if (slugBase === PLANO_COMPLETO) {
                    const franquia = assinatura.franquia_contratada_cobrancas || 0;
                    const calculo = await passageiroService.calcularPassageirosDisponiveis(cobranca.usuario_id, franquia);
                    if (calculo.precisaSelecaoManual) {
                        logger.warn({
                            cobrancaId,
                            usuarioId: cobranca.usuario_id,
                            franquia,
                            totalPossivel: calculo.totalPossivel,
                            jaAtivos: calculo.jaAtivos
                        }, "Tentativa de gerar PIX mas precisa seleção manual - retornando flag");
                        // Retornar flag indicando que precisa seleção manual
                        // O frontend deve mostrar o dialog de seleção primeiro
                        return {
                            qrCodePayload: "",
                            location: "",
                            inter_txid: "",
                            cobrancaId: cobranca.id,
                            precisaSelecaoManual: true,
                            tipo: "upgrade",
                            franquia,
                        };
                    }
                }
            }
        }
        // Buscar dados do usuário
        const usuario = cobranca.usuarios;
        if (!usuario || !usuario.cpfcnpj || !usuario.nome) {
            throw new Error("Dados do usuário incompletos para gerar PIX.");
        }
        // Gerar novo PIX
        logger.info({ cobrancaId, usuarioId: cobranca.usuario_id }, "Gerando novo PIX para cobrança");
        const pixData = await interService.criarCobrancaPix(supabaseAdmin, {
            cobrancaId: cobranca.id,
            valor: Number(cobranca.valor),
            cpf: usuario.cpfcnpj,
            nome: usuario.nome,
        });
        // Atualizar cobrança com dados do PIX
        const { error: updateError } = await supabaseAdmin
            .from("assinaturas_cobrancas")
            .update({
            inter_txid: pixData.interTransactionId,
            qr_code_payload: pixData.qrCodePayload,
            location_url: pixData.location,
        })
            .eq("id", cobranca.id);
        if (updateError) {
            logger.error({ error: updateError.message, cobrancaId }, "Erro ao atualizar cobrança com dados do PIX");
            throw new Error("Erro ao salvar dados do PIX.");
        }
        return {
            qrCodePayload: pixData.qrCodePayload,
            location: pixData.location,
            inter_txid: pixData.interTransactionId,
            cobrancaId: cobranca.id,
        };
    },
};
