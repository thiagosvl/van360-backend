import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { paymentWebhookController } from "../controllers/payment-webhook.controller.js";

const paymentWebhookRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post("/inter", paymentWebhookController.handlePix);
};

export default paymentWebhookRoutes;
