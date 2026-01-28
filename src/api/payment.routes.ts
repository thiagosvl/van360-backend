import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { paymentController } from "../controllers/payment.controller.js";

const paymentRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post("/pix", paymentController.criarPix);
  app.post("/registrar-webhook", paymentController.registrarWebhook);
  app.get("/retornos", paymentController.consultarCallbacks);
};

export default paymentRoutes;
