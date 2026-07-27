import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { evolutionController } from "../controllers/evolution.controller.js";

const evolutionRoute: FastifyPluginAsync = async (app: FastifyInstance) => {

    app.post("/webhook", { config: { rateLimit: false } }, evolutionController.webhook);
    app.post("/webhook/*", { config: { rateLimit: false } }, evolutionController.webhook);

};

export default evolutionRoute;
