import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";
import { addToPayoutQueue } from "../../queues/payout.queue.js";
import { PixKeyStatus, RepasseState } from "../../types/enums.js";
import { repasseFsmService } from "../repasse-fsm.service.js";

/**
 * Job de retentativa: busca repasses em estado de erro ou expirados
 * cujos motoristas agora têm chave PIX validada.
 */
export const repasseRetryJob = {
    async run() {
        logger.info("[RepasseRetry] Verificando repasses elegíveis para retentativa...");

        const estadosRetentaveis = [
            RepasseState.ERRO_DECODIFICACAO,
            RepasseState.ERRO_TRANSFERENCIA,
            RepasseState.EXPIRADO,
        ];

        const repasses = await repasseFsmService.buscarPorEstados(estadosRetentaveis);

        if (!repasses || repasses.length === 0) {
            logger.info("[RepasseRetry] Nenhum repasse elegível para retentativa.");
            return;
        }

        let retried = 0;

        for (const repasse of repasses) {
            try {
                if (repasse.tentativa >= repasse.max_tentativas) {
                    logger.debug({ id: repasse.id, tentativa: repasse.tentativa }, "[RepasseRetry] Max tentativas atingido. Ignorando.");
                    continue;
                }

                const { data: usuario } = await supabaseAdmin
                    .from("usuarios")
                    .select("id, chave_pix, status_chave_pix")
                    .eq("id", repasse.usuario_id)
                    .single();

                if (!usuario || !usuario.chave_pix || usuario.status_chave_pix !== PixKeyStatus.VALIDADA) {
                    logger.debug({ repasseId: repasse.id, motoristaId: repasse.usuario_id, statusPix: usuario?.status_chave_pix }, "[RepasseRetry] Chave PIX não validada. Ignorando.");
                    continue;
                }

                await repasseFsmService.transicionar(repasse.id, RepasseState.CRIADO, {
                    ator: "repasse_retry",
                    motivo: `Retentativa automática (tentativa ${repasse.tentativa + 1}): chave PIX agora validada`,
                });

                await addToPayoutQueue({
                    cobrancaId: repasse.cobranca_id,
                    repasseId: repasse.id,
                    valorRepasse: Number(repasse.valor),
                    motoristaId: repasse.usuario_id,
                });

                retried++;
                logger.info({ repasseId: repasse.id, tentativa: repasse.tentativa + 1 }, "[RepasseRetry] ✅ Repasse reenfileirado para retentativa.");

            } catch (err: any) {
                logger.error({ error: err.message, repasseId: repasse.id }, "[RepasseRetry] Erro ao retentar repasse");
            }
        }

        logger.info({ retried, total: repasses.length }, `[RepasseRetry] Finalizado. ${retried} repasse(s) reenfileirado(s).`);
    }
};
