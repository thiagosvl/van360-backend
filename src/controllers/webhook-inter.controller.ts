import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { addToWebhookQueue } from "../queues/webhook.queue.js";

export const webhookInterController = {
  async handlePix(req: FastifyRequest, reply: FastifyReply) {
    try {
      const body = req.body as any;
      
      // Validação básica do Payload para evitar lixo
      let pixList: any[] = [];
      if (body?.pix && Array.isArray(body.pix)) {
        pixList = body.pix;
      } else if (body?.txid && body?.valor) {
        pixList = [body]; 
      } else {
        logger.warn("Webhook ignorado: Formato desconhecido");
        reply.status(200).send({ received: true });
        return;
      }

      logger.info({ count: pixList.length }, "=== [API] Webhook Recebido (Enfileirando) ===");

      // Enfileirar cada PIX individualmente
      for (const pagamento of pixList) {
          try {
              await addToWebhookQueue({
                  pagamento,
                  origin: 'INTER_V4'
              });
          } catch (qErr) {
              logger.error({ qErr, txid: pagamento.txid }, "Erro ao enfileirar webhook");
              // Nota: Se o Redis estiver fora, a API vai falhar aqui e retornar 500 pro banco.
              // Isso é o comportamento correto: "Não consegui salvar, tente depois".
              throw qErr; 
          }
      }

      // Responder Rápido
      reply.status(200).send({ received: true, queued: true });

    } catch (err: any) {
      logger.error({ err }, "Erro crítico no Endpoint do Webhook");
      reply.status(500).send({ error: "Erro interno no processamento" });
    }
  }
};
