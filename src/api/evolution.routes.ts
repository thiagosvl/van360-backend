import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { evolutionController } from "../controllers/evolution.controller.js";

const evolutionRoute: FastifyPluginAsync = async (app: FastifyInstance) => {

    app.post("/webhook", { logLevel: "warn", bodyLimit: 52428800, config: { rateLimit: false } }, evolutionController.webhook);
    app.post("/webhook/*", { logLevel: "warn", bodyLimit: 52428800, config: { rateLimit: false } }, evolutionController.webhook);

};

export default evolutionRoute;
