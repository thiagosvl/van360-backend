
import { DRIVER_EVENT_PAYMENT_CONFIRMED } from "../../config/constants.js";
import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";
import { addToReceiptQueue } from "../../queues/receipt.queue.js";
import { PaymentMethod } from "../../types/enums.js";
import { formatDate } from "../../utils/format.js";
import { processarPagamentoCobranca } from "../processar-pagamento.service.js";
import { ReceiptData } from "../receipt.service.js";
import { processarRetornoValidacaoPix } from "../validacao-pix.service.js";

export const webhookAssinaturaHandler = {
  async handle(pagamento: any): Promise<boolean> {
    const { txid, valor, horario, endToEndId } = pagamento;

    // 1. Tentar buscar em assinaturas_cobrancas
    const { data: cobranca, error: findError } = await supabaseAdmin
      .from("assinaturas_cobrancas")
      .select(`
            id, usuario_id, assinatura_usuario_id, status, data_vencimento, billing_type, mes, ano,
            usuarios(nome, telefone),
            planos:assinaturas_usuarios(planos(nome))
       `)
      .eq("inter_txid", txid)
      .maybeSingle();

    if (findError) {
      logger.error({ txid, findError }, "Erro ao buscar assinatura no banco");
      return false; 
    }

    if (!cobranca) {
        if (endToEndId) {
            const resultado = await processarRetornoValidacaoPix({ e2eId: endToEndId });
            if (resultado && resultado.success) {
                logger.info({ endToEndId }, "Webhook processado como Validação PIX (Assinatura).");
                return true;
            }
        }
        return false;
    }

    logger.info({ cobrancaId: cobranca.id, context: "ASSINATURA" }, "Cobrança de assinatura encontrada.");
    
    try {
        const dataPagamento = horario || new Date().toISOString();

        // A) Processar Pagamento (Lógica de Negócio: Ativar Assinatura, etc)
        await processarPagamentoCobranca(
            cobranca,
            {
                valor,
                dataPagamento,
                txid,
            },
            { txid },
            undefined // NÃO passar reciboUrl aqui, pois ainda não existe
        );

        // B) Enfileirar Geração de Recibo + Notificação
        try {
            const usuario = cobranca.usuarios as any;
            // Corrigir acesso a planos aninhados se necessário: cobranca.planos -> assinaturas_usuarios -> planos
            // O select acima está complexo, simplificando:
            const nomePlano = (cobranca as any).planos?.planos?.nome || "Plano Van360";

            const receiptData: ReceiptData = {
                id: cobranca.id,
                titulo: "Recibo de Pagamento",
                subtitulo: "Van360 - Sistema de Gestão",
                valor: valor,
                data: formatDate(dataPagamento),
                pagadorNome: usuario?.nome || "Assinante",
                mes: cobranca.mes,
                ano: cobranca.ano,
                descricao: `Mensalidade - ${nomePlano}`,
                metodoPagamento: PaymentMethod.PIX,
                tipo: 'ASSINATURA'
            };

            await addToReceiptQueue({
                receiptData,
                notificationContext: {
                    phone: usuario?.telefone,
                    eventType: DRIVER_EVENT_PAYMENT_CONFIRMED,
                    templateData: {
                        nomeMotorista: usuario?.nome,
                        nomePlano: nomePlano,
                        dataVencimento: cobranca.data_vencimento
                    }
                }
            });

        } catch (queueErr) {
            logger.error({ queueErr }, "Erro ao enfileirar recibo de assinatura");
        }

        return true;
    } catch (err) {
        logger.error({ err, cobrancaId: cobranca.id }, "Erro ao processar pagamento de assinatura");
        throw err;
    }
  }
};
