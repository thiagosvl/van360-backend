import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { webhookInterController } from "../controllers/webhook-inter.controller.js";

const webhookInterRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post("/receber-pix-usuario", webhookInterController.handlePix);
};

export default webhookInterRoute;
