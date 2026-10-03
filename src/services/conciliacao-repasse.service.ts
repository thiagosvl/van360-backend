import { logger } from "../config/logger.js";
import { cobrancaRepasseRepository } from "../repositories/cobranca-repasse.repository.js";
import { motoristaFinanceiroRepository } from "../repositories/motorista-financeiro.repository.js";
import { addToRepasseQueue } from "../queues/repasse.queue.js";

export async function conciliarRepassesPendentes(): Promise<void> {
  logger.info("[ConciliacaoRepasse] Iniciando varredura de repasses pendentes/falhos...");

  try {
    const repassesPendentes = await cobrancaRepasseRepository.getPendentesParaConciliacao();

    if (repassesPendentes.length === 0) {
      logger.info("[ConciliacaoRepasse] Nenhum repasse pendente para conciliação.");
      return;
    }

    logger.info({ count: repassesPendentes.length }, "[ConciliacaoRepasse] Repasses encontrados para reprocessamento");

    for (const repasse of repassesPendentes) {
      try {
        const config = await motoristaFinanceiroRepository.getByUsuarioId(repasse.motorista_id);
        const chavePix = config.chave_pix_repasse;

        if (!chavePix) {
          logger.warn({ repasseId: repasse.id, motoristaId: repasse.motorista_id }, "[ConciliacaoRepasse] Motorista sem chave Pix cadastrada");
          continue;
        }

        await addToRepasseQueue({
          repasseId: repasse.id,
          cobrancaId: repasse.cobranca_id,
          motoristaId: repasse.motorista_id,
          chavePix,
          valorLiquido: Number(repasse.valor_liquido_motorista),
          transacaoProvedorId: repasse.transacao_provedor_id
        });
      } catch (itemErr: unknown) {
        const msg = itemErr instanceof Error ? itemErr.message : String(itemErr);
        logger.error({ error: msg, repasseId: repasse.id }, "[ConciliacaoRepasse] Falha ao enfileirar repasse na conciliação");
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ error: msg }, "[ConciliacaoRepasse] Falha geral no cron de conciliação de repasses");
  }
}
