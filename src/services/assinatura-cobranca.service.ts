import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import { CobrancaOrigem, SubscriptionBillingType, SubscriptionChargeStatus } from "../types/enums.js";
import { interService } from "./inter.service.js";

export const assinaturaCobrancaService = {
    async getAssinaturaCobranca(id: string): Promise<any> {
        const { data, error } = await supabaseAdmin
            .from("assinaturas_cobrancas")
            .select("*")
            .eq("id", id)
            .single();

        if (error) throw error;
        return data;
    },

    async listAssinaturaCobrancas(
        filtros?: {
            usuarioId?: string;
            assinaturaUsuarioId?: string;
        }
    ): Promise<any[]> {
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
        if (error) throw error;

        return data || [];
    },

    async gerarPixParaCobranca(cobrancaId: string): Promise<{
        qrCodePayload: string;
        location: string;
        inter_txid: string;
        cobrancaId: string;
        tipo?: "upgrade" | "downgrade";
        franquia?: number;
    }> {
        // Buscar cobrança com dados do usuário e assinatura
        const { data: cobranca, error: cobrancaError } = await supabaseAdmin
            .from("assinaturas_cobrancas")
            .select(`
                id,
                valor,
                created_at,
                status,
                qr_code_payload,
                inter_txid,
                location_url,
                usuario_id,
                assinatura_usuario_id,
                billing_type,
                data_vencimento,
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

        if (cobranca.status !== SubscriptionChargeStatus.PENDENTE) {
            throw new Error("Esta cobrança não está pendente de pagamento.");
        }

        // DECISÃO DE ESTRATÉGIA (COB vs COBV)
        const isCobrancaComVencimento = 
            cobranca.billing_type === "subscription" || 
            (cobranca.billing_type === "activation" && 
             cobranca.data_vencimento && 
             new Date(cobranca.data_vencimento + 'T12:00:00') > new Date());

        // VERIFICAÇÃO DE CACHE E EXPIRAÇÃO
        if (cobranca.qr_code_payload && cobranca.inter_txid) {
            // Se for cobrança imediata (upgrade), verificar se expirou (1h / 3600s)
            if (!isCobrancaComVencimento) {
                const createdAt = new Date(cobranca.created_at).getTime();
                const now = Date.now();
                const diffSeconds = (now - createdAt) / 1000;

                // Se passou de 3500 segundos (margem de segurança antes de 3600), regenerar
                if (diffSeconds > 3500) {
                    logger.info({ cobrancaId, diffSeconds }, "PIX imediato expirado. Regenerando...");
                    // Prosseguir para gerar novo PIX (ignora o return de cache)
                } else {
                    logger.info({ cobrancaId }, "Reutilizando PIX imediato válido");
                    return {
                        qrCodePayload: cobranca.qr_code_payload,
                        location: cobranca.location_url || "",
                        inter_txid: cobranca.inter_txid,
                        cobrancaId: cobranca.id,
                    };
                }
            } else {
                // Se for Cobrança com Vencimento (COBV), reutilizar sempre (o QR Code é durável)
                // TODO: Opcionalmente verificar se já passou da data de vencimento + tolerância
                logger.info({ cobrancaId }, "Reutilizando PIX com vencimento (cobv)");
                return {
                    qrCodePayload: cobranca.qr_code_payload,
                    location: cobranca.location_url || "",
                    inter_txid: cobranca.inter_txid,
                    cobrancaId: cobranca.id,
                };
            }
        }

        // Buscar dados do usuário
        const usuario = cobranca.usuarios as any;
        if (!usuario || !usuario.cpfcnpj || !usuario.nome) {
            throw new Error("Dados do usuário incompletos para gerar PIX.");
        }

        let pixData;

        // GERAÇÃO DO PIX NO INTER (COB ou COBV)
        if (isCobrancaComVencimento) {
             logger.info({ cobrancaId, billingType: cobranca.billing_type }, "Gerando PIX com Vencimento (cobv)");
             
             // Definir vencimento (se não tiver na cobrança, usar hoje + 3 dias como fallback seguro, ou tratar erro)
             const dataVencimento = cobranca.data_vencimento || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

             pixData = await interService.criarCobrancaComVencimentoPix(supabaseAdmin, {
                cobrancaId: cobranca.id,
                valor: Number(cobranca.valor),
                cpf: usuario.cpfcnpj,
                nome: usuario.nome,
                dataVencimento: dataVencimento,
                validadeAposVencimentoDias: 30 // Pode virar config no futuro
             });

        } else {
            logger.info({ cobrancaId, billingType: cobranca.billing_type }, "Gerando PIX Imediato (cob)");
            
            pixData = await interService.criarCobrancaPix(supabaseAdmin, {
                cobrancaId: cobranca.id,
                valor: Number(cobranca.valor),
                cpf: usuario.cpfcnpj,
                nome: usuario.nome,
            });
        }

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

    async gerarCobrancaAtivacao(payload: {
        usuarioId: string;
        assinaturaId: string;
        valor: number;
        dataVencimento: string;
        descricao: string;
        cpfResponsavel: string;
        nomeResponsavel: string;
    }): Promise<{ cobranca: any; pixData: any; location: string }> {
        const { usuarioId, assinaturaId, valor, dataVencimento, descricao, cpfResponsavel, nomeResponsavel } = payload;
        
        // 1. Criar registro de cobrança PENDENTE
        const cobrancaId = crypto.randomUUID();
        
        const { data: cobranca, error: cobrancaError } = await supabaseAdmin
          .from("assinaturas_cobrancas")
          .insert({
            id: cobrancaId,
            usuario_id: usuarioId,
            assinatura_usuario_id: assinaturaId,
            valor: valor,
            status: SubscriptionChargeStatus.PENDENTE,
            data_vencimento: dataVencimento,
            origem: CobrancaOrigem.INTER,
            billing_type: SubscriptionBillingType.ACTIVATION,
            descricao: descricao,
          })
          .select()
          .single();
        
        if (cobrancaError) throw new AppError(`Erro ao criar cobrança de ativação: ${cobrancaError.message}`, 500);
        
        // 2. Gerar PIX via Inter
        let pixData: any = {};
        try {
            pixData = await interService.criarCobrancaComVencimentoPix(supabaseAdmin, {
                cobrancaId: cobranca.id,
                valor: valor,
                cpf: cpfResponsavel,
                nome: nomeResponsavel,
                dataVencimento: dataVencimento,
                validadeAposVencimentoDias: 30
            });
            
            // Atualizar payload do PIX (inline update)
            await supabaseAdmin
                .from("assinaturas_cobrancas")
                .update({
                    inter_txid: pixData.interTransactionId,
                    qr_code_payload: pixData.qrCodePayload,
                    location_url: pixData.location
                })
                .eq("id", cobranca.id);

        } catch (err: any) {
            logger.error({ err, cobrancaId: cobranca.id }, "Falha ao gerar PIX para ativação.");
        }
        
        return { cobranca, pixData, location: pixData?.location };
    },

    async gerarCobrancaRenovacao(payload: {
        usuarioId: string;
        assinaturaId: string;
        valor: number;
        dataVencimento: string;
        descricao: string;
    }): Promise<{ cobranca: any; generatedPix: boolean }> {
        const { usuarioId, assinaturaId, valor, dataVencimento, descricao } = payload;
        
        // 1. Criar registro de cobrança
        const { data: cobranca, error: cobrancaError } = await supabaseAdmin
          .from("assinaturas_cobrancas")
          .insert({
            usuario_id: usuarioId,
            assinatura_usuario_id: assinaturaId,
            valor: valor,
            status: SubscriptionChargeStatus.PENDENTE,
            data_vencimento: dataVencimento,
            billing_type: SubscriptionBillingType.RENEWAL,
            descricao: descricao,
          })
          .select()
          .single();
        
        if (cobrancaError) throw new Error(`Erro ao criar cobrança de renovação: ${cobrancaError.message}`);
        
        // 2. Gerar PIX (Reaproveita lógica interna)
        try {
             await this.gerarPixParaCobranca(cobranca.id);
             return { cobranca, generatedPix: true };
        } catch (err: any) {
            logger.error({ err, cobrancaId: cobranca.id }, "Falha CRÍTICA ao gerar PIX de renovação. Realizando Rollback.");
            // Rollback mandatorio aqui pois é um Job
            await supabaseAdmin.from("assinaturas_cobrancas").delete().eq("id", cobranca.id);
            throw new Error(`Falha PIX: ${err.message}`);
        }
    },

};
