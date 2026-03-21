import { FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { jobsController } from "../controllers/jobs.controller.js";

export async function jobsRoute(app: FastifyInstance) {

  // Middleware de segurança simples para Cron Jobs
  app.addHook("preHandler", async (request, reply) => {
    const authHeader = request.headers["authorization"];
    const token = authHeader?.replace("Bearer ", "");

    if (token !== env.CRON_SECRET) {
      logger.warn({ ip: request.ip }, "Tentativa de acesso não autorizado a /jobs");
      return reply.code(401).send({ error: "Unauthorized" });
    }
  });

  app.post("/daily-routine", jobsController.runDailyRoutine);
}
