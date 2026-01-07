import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { logger } from "../config/logger.js";
import { webhookAssinaturaHandler } from "../services/handlers/webhook-assinatura.handler.js";
import { webhookCobrancaHandler } from "../services/handlers/webhook-cobranca.handler.js";

const webhookInterRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post("/receber-pix-usuario", async (req, reply) => {
    try {
      const body = req.body as any;
      console.log("=== Webhook recebido do Inter (Dispatcher V4) ===");
      // console.dir(body, { depth: 5 }); // Reduzido log verboso em prod

      let pixList: any[] = [];
      
      // Normalização do Payload
      if (body?.pix && Array.isArray(body.pix)) {
        pixList = body.pix;
      } else if (body?.txid && body?.valor) {
        pixList = [body]; // Formato Flat (Test Tools)
      } else {
        logger.warn("Formato de payload desconhecido ou vazio");
        reply.status(200).send({ received: true }); // Responde OK para não travar fila do banco
        return;
      }

      // Dispatcher Loop
      for (const pagamento of pixList) {
        try {
            const { txid } = pagamento;
            logger.info({ txid }, "Dispatching Webhook Pagemento...");

            // 1. Tentar Handler de Assinaturas (Prioridade: Sistema SaaS)
            const handledAssinatura = await webhookAssinaturaHandler.handle(pagamento);
            if (handledAssinatura) {
                continue; // Processado
            }

            // 2. Tentar Handler de Cobranças/Pais (Repasse)
            const handledCobranca = await webhookCobrancaHandler.handle(pagamento);
            if (handledCobranca) {
                continue; // Processado
            }

            // 3. Fallback: Log
            logger.warn({ txid, endToEndId: pagamento.endToEndId }, "Webhook não processado por nenhum handler (Não encontrado ou ignorado)");

        } catch (innerErr) {
            logger.error({ innerErr, txid: pagamento.txid }, "Exceção no processamento individual do PIX");
        }
      }

      reply.status(200).send({ received: true });

    } catch (err: any) {
      logger.error({ err }, "Erro crítico no Dispatcher do Webhook");
      reply.status(500).send({ error: "Erro interno no processamento" });
    }
  });
};

export default webhookInterRoute;
