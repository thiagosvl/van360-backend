import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { evolutionController } from "../controllers/evolution.controller.js";

const evolutionRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
    
    // Webhook Publico (Protegido por segredo configurado na Evolution se necessário, ou obfuscado)
    // Para simplificar, vamos assumir que apenas a Evolution chama aqui.
    // POST /api/evolution/webhook
    app.post("/webhook", evolutionController.webhook);

};

export default evolutionRoute;
