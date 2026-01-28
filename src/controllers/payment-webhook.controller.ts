import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { paymentService } from "../services/payment.service.js";
import { PixWebhookDTO, pixWebhookSchema } from "../types/dtos/payment.dto.js";
import { PaymentGateway } from "../types/enums.js";

async function processPixWebhook(req: FastifyRequest, reply: FastifyReply, gateway: PaymentGateway) {
  try {
    // 1. Validação com Zod (Diretriz #11)
    const body = pixWebhookSchema.parse(req.body) as PixWebhookDTO;
    
    // 2. Extração da lista de pagamentos
    let pixList: any[] = [];
    if (body.pix) {
      pixList = body.pix;
    } else if (body.txid && body.valor) {
      pixList = [body]; 
    } else {
      logger.warn({ gateway }, "Webhook ignorado: Formato de payload incompleto");
      return reply.status(200).send({ received: true });
    }

    logger.info({ count: pixList.length, gateway }, "[Webhook] Processando pagamentos recebidos");

    // 3. Delegar lógica para o Service (Diretriz #9)
    await paymentService.enqueueWebhooks(pixList, gateway);

    return reply.status(200).send({ received: true, queued: true });

  } catch (err: any) {
    logger.error({ err: err.message, gateway }, "Erro no processamento do Webhook");
    
    // Se for erro de validação do Zod, retornamos 400
    if (err.name === "ZodError") {
      return reply.status(400).send({ error: "Payload inválido", details: err.errors });
    }

    return reply.status(500).send({ error: "Erro interno no processamento" });
  }
}

export const paymentWebhookController = {
  /**
   * Webhook genérico (usa gateway ativo)
   */
  async handlePix(req: FastifyRequest, reply: FastifyReply) {
    const activeGateway = paymentService.getActiveGateway();
    return processPixWebhook(req, reply, activeGateway);
  },

  /**
   * Webhook específico Banco Inter
   */
  async handlePixInter(req: FastifyRequest, reply: FastifyReply) {
    return processPixWebhook(req, reply, PaymentGateway.INTER);
  },

  /**
   * Webhook específico C6 Bank
   */
  async handlePixC6(req: FastifyRequest, reply: FastifyReply) {
    return processPixWebhook(req, reply, PaymentGateway.C6);
  }
};

