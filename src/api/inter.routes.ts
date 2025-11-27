import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { supabaseAdmin } from "../config/supabase";
import { interService } from "../services/inter.service";

const interRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post("/pix", async (req, reply) => {
    const body = req.body as { cobrancaId: string; valor: number; cpf: string; nome: string };
    try {
      const cobranca = await interService.criarCobrancaPix(supabaseAdmin, body);
      return reply.status(200).send(cobranca);
    } catch (err: any) {
      app.log.error(err, "Falha ao criar cobrança PIX no Inter");
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post("/registrar-webhook", async (req, reply) => {
    const { url } = req.body as { url: string };
    if (!url) return reply.status(400).send({ error: "URL do webhook é obrigatória" });

    try {
      const result = await interService.registrarWebhookPix(supabaseAdmin, url);
      return reply.status(200).send(result);
    } catch (err: any) {
      app.log.error(err, "Falha ao registrar webhook PIX");
      return reply.status(500).send({ error: err.message });
    }
  });
};

export default interRoutes;
