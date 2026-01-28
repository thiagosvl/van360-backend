import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { webhookAssinaturaHandler } from "../services/handlers/webhook-assinatura.handler.js";
import { webhookCobrancaHandler } from "../services/handlers/webhook-cobranca.handler.js";
import { StandardPaymentPayload } from "../types/webhook.js";

const mockPagamentoRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post("/mock-pagamento", async (request, reply) => {
    const cobrancaId = (request.query as any)?.id;

    if (!cobrancaId) {
      return reply.status(400).send({ error: "Parâmetro 'id' (Cobranca ID) ausente." });
    }

    try {
      logger.info({ cobrancaId }, "Iniciando mock de pagamento");

      logger.info({ cobrancaId }, "Mock Pagamento iniciado");

      // 1. Tentar achar na tabela de Assinaturas (Prioridade Alta)
      let { data: cobrancaAssinatura } = await supabaseAdmin
        .from("assinaturas_cobrancas")
        .select("id, valor, gateway_txid")
        .eq("id", cobrancaId)
        .maybeSingle();

      // 2. Se não achar, tentar na tabela de Passageiros (Pais)
      let cobrancaPai = null;
      if (!cobrancaAssinatura) {
          const { data: paiResult } = await supabaseAdmin
            .from("cobrancas")
            .select("id, valor, gateway_txid")
            .eq("id", cobrancaId)
            .maybeSingle();
          cobrancaPai = paiResult;
      }

      if (!cobrancaAssinatura && !cobrancaPai) {
          logger.warn({ cobrancaId }, "Cobrança não encontrada em nenhuma tabela (Assinatura ou Pais)");
          return reply.status(404).send({ error: "Cobrança não encontrada." });
      }

      // 3. Montar Payload do Webhook
      const targetCobranca = (cobrancaAssinatura || cobrancaPai) as any;
      const txid = targetCobranca.gateway_txid;
      
      if (!txid) {
          logger.error({ cobrancaId, foundRecord: targetCobranca }, "Mock: Cobrança encontrada mas sem TXID.");
          return reply.status(400).send({ 
              success: false, 
              error: "A cobrança informada não possui um TXID (Pix) vinculado no banco de dados.",
              debug: {
                  idEncontrado: targetCobranca.id,
                  colunas: Object.keys(targetCobranca),
                  valores: targetCobranca
              }
          });
      }

      const valor = Number(targetCobranca.valor);
      const horario = new Date().toISOString();

      logger.info({ cobrancaId, tipo: cobrancaAssinatura ? 'ASSINATURA' : 'PAI', txid }, "Mock: Despachando para Webhook Handler");

      const webhookPayload: StandardPaymentPayload = {
        gatewayTransactionId: txid,
        amount: valor,
        paymentDate: horario,
        rawPayload: { mocked: true, cobrancaId },
        gateway: 'mock'
      };

      // 4. Delegar para os Handlers Oficiais (Universal)
      // Mirroring the logic in webhook.worker.ts
      
      // A) Tentar Assinatura (Sistema)
      const sucessoAssinatura = await webhookAssinaturaHandler.handle(webhookPayload);
      if (sucessoAssinatura) {
        return reply.status(200).send({
            success: true,
            message: `Simulação processada como ASSINATURA. ID: ${cobrancaId}`,
            txid,
            simulacao: true
        });
      }

      // B) Tentar Cobrança (Pai/Passageiro)
      const sucessoCobranca = await webhookCobrancaHandler.handle(webhookPayload);
      if (sucessoCobranca) {
        return reply.status(200).send({
            success: true,
            message: `Simulação processada como COBRANCA_PAI. ID: ${cobrancaId}`,
            txid,
            simulacao: true
        });
      }

      return reply.status(200).send({
        success: false,
        message: `Nenhum handler encontrou a cobrança com ID ou TXID informado.`,
        txid,
        simulacao: true
      });

    } catch (err: any) {
      logger.error({ error: err.message, cobrancaId, stack: err.stack }, "Falha no Mock Pagamento.");
      return reply.status(500).send({ error: err.message || "Falha interna no mock." });
    }
  });
};

export default mockPagamentoRoute;
