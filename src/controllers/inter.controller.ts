import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { interService } from "../services/inter.service.js";

export const interController = {
  criarPix: async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { cobrancaId: string; valor: number; cpf: string; nome: string };
    try {
      const cobranca = await interService.criarCobrancaPix(supabaseAdmin, body);
      return reply.status(200).send(cobranca);
    } catch (err: any) {
      logger.error({ err }, "Falha ao criar cobrança PIX no Inter");
      return reply.status(500).send({ error: err.message });
    }
  },

  registrarWebhook: async (request: FastifyRequest, reply: FastifyReply) => {
    const { url } = request.body as { url: string };
    if (!url) return reply.status(400).send({ error: "URL do webhook é obrigatória" });

    try {
      const result = await interService.registrarWebhookPix(supabaseAdmin, url);
      return reply.status(200).send(result);
    } catch (err: any) {
      logger.error({ err }, "Falha ao registrar webhook PIX");
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
      const result = await interService.consultarCallbacks(supabaseAdmin, start, end);
      return reply.status(200).send(result);
    } catch (err: any) {
      logger.error({ err }, "Falha ao consultar callbacks PIX");
      return reply.status(500).send({ error: err.message });
    }
  }
};
