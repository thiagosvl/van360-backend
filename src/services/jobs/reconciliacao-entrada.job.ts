import { logger } from "../../config/logger.js";
import { webhookCobrancaHandler } from "../handlers/webhook-cobranca.handler.js";
import { paymentService } from "../payment.service.js";

interface JobResult {
    processed: number;
    reconciled: number;
    errors: number;
    details: any[];
}

export const reconciliacaoEntradaJob = {
    async run(): Promise<JobResult> {
        const result: JobResult = { processed: 0, reconciled: 0, errors: 0, details: [] };
        
        logger.info("Iniciando Job de Reconciliação de Entradas (Recebimentos PIX)");

        try {
            // 1. Definir Intervalo (Últimas 48 horas para segurança)
            const fim = new Date();
            const inicio = new Date();
            inicio.setDate(fim.getDate() - 2); // 2 dias atrás

            const inicioStr = inicio.toISOString();
            const fimStr = fim.toISOString();

            logger.info({ inicioStr, fimStr }, "Buscando pagamentos confirmados no Provedor...");

            // 2. Buscar no Provedor
            const provider = paymentService.getProvider();
            const cobrancasPagas = await provider.listarPixRecebidos(inicioStr, fimStr);

            if (!cobrancasPagas || cobrancasPagas.length === 0) {
                logger.info("Nenhum pagamento encontrado no período no Provedor.");
                return result;
            }

            logger.info({ count: cobrancasPagas.length }, "Pagamentos encontrados. Verificando consistência...");

            // 3. Processar cada Cobrança Paga
            for (const item of cobrancasPagas) {
                result.processed++;
                const txid = item.txid;
                
                // A cobrança pode ter múltiplos pagamentos parciais, mas no PIX geralmente é 1.
                // O array 'pix' contem os detalhes do pagamento efetivado.
                if (!item.pix || item.pix.length === 0) continue;

                for (const pagamento of item.pix) {
                    try {
                        const payloadReconciliacao = {
                            gatewayTransactionId: txid,
                            amount: Number(pagamento.valor),
                            paymentDate: pagamento.horario,
                            endToEndId: pagamento.endToEndId,
                            gateway: paymentService.getActiveGateway(),
                            rawPayload: pagamento
                        };

                        // 4. Invocar Handler (Mesma lógica do Webhook)
                        // O Handler é idempotente: ele verifica se já está pago antes de processar.
                        // Se retornar 'true', significa que processou (ou tentou).
                        // Se já estava pago, ele loga "já está paga" e retorna true/false dependendo da impl.
                        
                        // Chamamos o handler. Se o boleto estava pendente, ele vai baixar e disparar tudo.
                        await webhookCobrancaHandler.handle(payloadReconciliacao);
                        result.reconciled++; // Contamos como 'verificado/reconciliado'

                    } catch (err: any) {
                        logger.error({ err, txid }, "Erro ao reconciliar pagamento específico");
                        result.errors++;
                        result.details.push({ txid, erro: err.message });
                    }
                }
            }

            logger.info({ result }, "Job de Reconciliação Finalizado.");
            return result;

        } catch (error: any) {
            logger.error({ error }, "Erro fatal no Job de Reconciliação");
            throw error;
        }
    }
};
