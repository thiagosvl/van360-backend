import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { paymentService } from "../services/payment.service.js";

export const paymentController = {
  criarPix: async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { cobrancaId: string; valor: number; cpf: string; nome: string };
    try {
      const provider = paymentService.getProvider();
      const cobranca = await provider.criarCobrancaImediata(body);
      return reply.status(200).send(cobranca);
    } catch (err: any) {
      logger.error({ err }, `Falha ao criar cobrança PIX no ${paymentService.getProvider().name}`);
      return reply.status(500).send({ error: err.message });
    }
  },

  registrarWebhook: async (request: FastifyRequest, reply: FastifyReply) => {
    const { url } = request.body as { url: string };
    if (!url) return reply.status(400).send({ error: "URL do webhook é obrigatória" });

    try {
      const provider = paymentService.getProvider();
      // Nota: Nem todos os provedores podem ter este método direto, 
      // mas mantemos para compatibilidade com o fluxo atual do Inter.
      const result = await (provider as any).registrarWebhook?.(url);
      return reply.status(200).send(result || { message: "Webhook registrado (se aplicável)" });
    } catch (err: any) {
      logger.error({ err }, "Falha ao registrar webhook de pagamento");
      return reply.status(500).send({ error: err.message });
    }
  },

  consultarCallbacks: async (request: FastifyRequest, reply: FastifyReply) => {
    const { dataInicio, dataFim } = request.query as { dataInicio: string; dataFim: string };
    
    // Default: Last 1 hour
    let start = dataInicio;
    let end = dataFim;

    if (!start || !end) {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        start = oneHourAgo.toISOString();
        end = now.toISOString();
    }

    try {
      const provider = paymentService.getProvider();
      const result = await (provider as any).consultarCallbacks?.(start, end);
      return reply.status(200).send(result || []);
    } catch (err: any) {
      logger.error({ err }, "Falha ao consultar callbacks de pagamento");
      return reply.status(500).send({ error: err.message });
    }
  }
};
