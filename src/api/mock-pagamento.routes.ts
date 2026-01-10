import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { webhookCobrancaHandler } from "../services/handlers/webhook-cobranca.handler.js";

const mockPagamentoRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post("/mock-pagamento", async (request, reply) => {
    const cobrancaId = (request.query as any)?.id;

    if (!cobrancaId) {
      return reply.status(400).send({ error: "Parâmetro 'id' (Cobranca ID) ausente." });
    }

    try {
      logger.info({ cobrancaId }, "Iniciando mock de pagamento");

      console.log("Mock Pagamento iniciado para ID:", cobrancaId);

      // 1. Tentar achar na tabela de Assinaturas (Prioridade Alta)
      let { data: cobrancaAssinatura } = await supabaseAdmin
        .from("assinaturas_cobrancas")
        .select("id, valor, inter_txid")
        .eq("id", cobrancaId)
        .maybeSingle();

      // 2. Se não achar, tentar na tabela de Passageiros (Pais)
      let cobrancaPai = null;
      if (!cobrancaAssinatura) {
          const { data: paiResult } = await supabaseAdmin
            .from("cobrancas")
            .select("id, valor, txid_pix")
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
      const txid = targetCobranca.inter_txid || targetCobranca.txid_pix || `MOCK-${cobrancaId}-${Date.now()}`;
      const valor = Number(targetCobranca.valor);
      const horario = new Date().toISOString();

      logger.info({ cobrancaId, tipo: cobrancaAssinatura ? 'ASSINATURA' : 'PAI', txid }, "Mock: Despachando para Webhook Handler");

      const webhookPayload = {
        txid,
        valor,
        horario,
        // Campos extras que o Banco Inter manda e podem ser úteis
        nossoNumero: cobrancaId,
        pagador: {
            nome: "MOCK USER"
        }
      };

      // 4. Delegar para o Handler Oficial (Universal)
      // O handler descobre o tipo baseado no txid, então vai funcionar para ambos
      const sucesso = await webhookCobrancaHandler.handle(webhookPayload);


      return reply.status(200).send({
        success: sucesso,
        message: `Simulação enviada para o Webhook Handler. ID: ${cobrancaId}`,
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
