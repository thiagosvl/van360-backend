
import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { logger } from "../config/logger.js";
import { chargeGeneratorJob } from "../services/jobs/charge-generator.job.js";

const jobsRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
  
  // Middleware simples de segurança (API Key)
  app.addHook('onRequest', async (req, reply) => {
    // Para simplificar, chave fixa ou via ENV (CRON_SECRET)
    const CRON_SECRET = process.env.CRON_SECRET || "van360-cron-secret-key";
    
    // Suporte a Bearer ou Header direto
    const authHeader = req.headers['authorization'];
    const apiKey = authHeader?.replace('Bearer ', '') || req.headers['x-api-key'];

    if (apiKey !== CRON_SECRET) {
      if (req.url.startsWith('/jobs')) { // Aplica apenas nas rotas de jobs
          reply.status(401).send({ error: "Unauthorized: Invalid CRON_SECRET" });
      }
    }
  });

  // Rota: Gerar Mensalidades (Roda Todo dia 25)
  // Payload opcional: { targetMonth: 2, targetYear: 2026 }
  app.post("/jobs/gerar-mensalidades", async (req, reply) => {
    try {
      logger.info("Iniciando Job: Gerar Mensalidades");
      const result = await chargeGeneratorJob.execute(req.body as any);
      reply.send(result);
    } catch (err: any) {
      logger.error({ err }, "Erro no Job de Geração de Mensalidades");
      reply.status(500).send({ error: err.message });
    }
  });

  // Rota: Notificar Vencimentos 
  // TODO: Implementar depois
  app.post("/jobs/notificar-vencimentos", async (req, reply) => {
     reply.send({ status: "Not implemented yet" });
  });

};

export default jobsRoute;
