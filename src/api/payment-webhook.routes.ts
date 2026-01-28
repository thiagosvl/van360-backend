import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { paymentWebhookController } from "../controllers/payment-webhook.controller.js";

const paymentWebhookRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Rotas específicas por Gateway (recomendado)
  app.post("/inter", paymentWebhookController.handlePixInter);
  app.post("/c6", paymentWebhookController.handlePixC6);
  
  // Rota genérica (legado - usa ACTIVE_GATEWAY)
  app.post("/", paymentWebhookController.handlePix);
};

export default paymentWebhookRoutes;

