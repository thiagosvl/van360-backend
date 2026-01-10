import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { interController } from "../controllers/inter.controller.js";

const interRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post("/pix", interController.criarPix);
  app.post("/registrar-webhook", interController.registrarWebhook);
  app.get("/retornos", interController.consultarCallbacks);
};

export default interRoutes;
