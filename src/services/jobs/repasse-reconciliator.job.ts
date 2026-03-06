import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";
import { CobrancaStatus, RepasseState } from "../../types/enums.js";
import { cobrancaPagamentoService } from "../cobranca-pagamento.service.js";

/**
 * Job de Reconciliação de Repasses (Outbound)
 * Busca cobranças que estão PAGAS mas não possuem repasse liquidado ou em andamento.
 */
export const repasseReconciliatorJob = {
    async run() {
        logger.info("[RepasseReconciliator] Iniciando reconciliação de repasses pendentes...");

        // 1. Buscar cobranças PAGAS nos últimos 30 dias que não têm repasse LIQUIDADO ou CANCELADO
        // Nota: O ideal é buscar cobranças onde não exista nenhum repasse terminal.
        // Como o Supabase não suporta subqueries complexas facilmente via SDK, buscamos as cobranças 
        // e verificamos o status do repasse.
        
        const trintaDiasAtras = new Date();
        trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
        
        const { data: cobrancas, error } = await supabaseAdmin
            .from("cobrancas")
            .select(`
                id, status, usuario_id,
                repasses(id, estado)
            `)
            .eq("status", CobrancaStatus.PAGO)
            .gte("data_pagamento", trintaDiasAtras.toISOString());

        if (error) {
            logger.error({ error }, "[RepasseReconciliator] Erro ao buscar cobranças para reconciliação");
            throw error;
        }

        if (!cobrancas || cobrancas.length === 0) {
            logger.info("[RepasseReconciliator] Nenhuma cobrança paga encontrada para reconciliar.");
            return;
        }

        let reconciled = 0;

        for (const cobranca of cobrancas) {
            const repasses = cobranca.repasses || [];
            
            // Estados que indicam que o repasse está sendo tratado ou já foi resolvido
            const estadosAtivosOuTerminais = [
                RepasseState.LIQUIDADO,
                RepasseState.DECODIFICANDO,
                RepasseState.DECODIFICADO,
                RepasseState.SUBMETIDO,
                RepasseState.AGUARDANDO_APROVACAO,
                RepasseState.EM_LIQUIDACAO
            ];

            const temRepasseAndamento = repasses.some((r: any) => estadosAtivosOuTerminais.includes(r.estado));

            if (!temRepasseAndamento) {
                logger.warn({ cobrancaId: cobranca.id }, "[RepasseReconciliator] Cobrança PAGA sem repasse ativo. Iniciando repasse...");
                
                try {
                    await cobrancaPagamentoService.iniciarRepasse(cobranca.id);
                    reconciled++;
                } catch (err: any) {
                    logger.error({ cobrancaId: cobranca.id, error: err.message }, "[RepasseReconciliator] Falha ao iniciar repasse na reconciliação");
                }
            }
        }

        logger.info({ reconciled, totalChecked: cobrancas.length }, "[RepasseReconciliator] Reconciliação finalizada.");
    }
};
