import { COBRANCA_STATUS_PAGA, STATUS_CHAVE_PIX_VALIDADA, STATUS_REPASSE_FALHA, STATUS_REPASSE_PENDENTE } from "../../config/constants.js";
import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";
import { cobrancaService } from "../cobranca.service.js";

export const repasseRetryJob = {
    async run() {
        logger.info("Iniciando Job de Retry de Repasses (Fila de Acumulados)");

        // 1. Buscar cobranças PAGAS mas com repasse FALHO ou PENDENTE
        // Precisamos filtrar apenas motoristas que AGORA estão com chave VALIDADA.
        // O Supabase permite filtrar em tabela relacionada.

        const { data: pendencias, error } = await supabaseAdmin
            .from("cobrancas")
            .select(`
                id, status_repasse, valor, 
                usuarios!inner (
                    id, nome, status_chave_pix
                )
            `)
            .eq("status", COBRANCA_STATUS_PAGA) // Dinheiro já entrou
            .in("status_repasse", [STATUS_REPASSE_FALHA, STATUS_REPASSE_PENDENTE]) // Repasse travado
            .eq("usuarios.status_chave_pix", STATUS_CHAVE_PIX_VALIDADA); // Chave agora está OK

        if (error) {
            logger.error({ error }, "Erro ao buscar fila de repasses para retry");
            return;
        }

        if (!pendencias || pendencias.length === 0) {
            logger.info("Nenhum repasse acumulado elegível para reprocessamento.");
            return;
        }

        logger.info({ count: pendencias.length }, "Repasses elegíveis encontrados. Iniciando processamento...");

        for (const cobranca of pendencias) {
            try {
                // Double check (redundante mas seguro)
                const motorista = cobranca.usuarios as any;
                if (motorista.status_chave_pix !== STATUS_CHAVE_PIX_VALIDADA) continue;

                logger.info({ cobrancaId: cobranca.id, motorista: motorista.nome }, "Retentando repasse...");

                // Chama logica original de repasse
                await cobrancaService.iniciarRepasse(cobranca.id);
                
                // Aguarda um pouco entre requisições para não estourar rate limit do Inter
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (err: any) {
                logger.error({ err, cobrancaId: cobranca.id }, "Falha ao reprocessar repasse da fila");
                // Continua para o próximo. Se falhar de novo, status_repasse vai ser atualizado para FALHA_REPASSE dentro do service.
            }
        }
    }
};
