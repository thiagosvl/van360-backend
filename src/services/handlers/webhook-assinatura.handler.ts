
import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";
import { processarPagamentoCobranca } from "../processar-pagamento.service.js";
import { processarRetornoValidacaoPix } from "../usuario.service.js";

export const webhookAssinaturaHandler = {
  async handle(pagamento: any): Promise<boolean> {
    const { txid, valor, horario, endToEndId } = pagamento;

    // 1. Tentar buscar em assinaturas_cobrancas
    const { data: cobranca, error: findError } = await supabaseAdmin
      .from("assinaturas_cobrancas")
      .select("id, usuario_id, assinatura_usuario_id, status, data_vencimento, billing_type")
      .eq("inter_txid", txid)
      .maybeSingle();

    if (findError) {
      logger.error({ txid, findError }, "Erro ao buscar assinatura no banco");
      return false; 
    }

    // 2. Se não encontrar, verificar se é uma validação de PIX (casos de R$ 0,01 ou micro-transações de teste)
    if (!cobranca) {
        if (endToEndId) {
            // Validação de PIX (Assinatura/Cadastro de Motorista)
            // Geralmente associado ao fluxo de assinatura/cartão, mas pode ocorrer aqui.
            const resultado = await processarRetornoValidacaoPix({ e2eId: endToEndId });
            if (resultado.success) {
                logger.info({ endToEndId }, "Webhook processado como Validação PIX (Assinatura).");
                return true;
            }
        }
        return false; // Não é deste contexto
    }

    // 3. Se encontrou, processar pagamento de assinatura
    logger.info({ cobrancaId: cobranca.id, context: "ASSINATURA" }, "Cobrança de assinatura encontrada.");
    
    try {
        await processarPagamentoCobranca(
            cobranca,
            {
                valor,
                dataPagamento: horario || new Date().toISOString(),
                txid,
            },
            { txid }
        );
        return true;
    } catch (err) {
        logger.error({ err, cobrancaId: cobranca.id }, "Erro ao processar pagamento de assinatura");
        throw err; // Lança para o pai decidir se loga ou ignora, mas processamento falhou
    }
  }
};
