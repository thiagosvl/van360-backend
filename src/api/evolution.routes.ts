import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { evolutionController } from "../controllers/evolution.controller.js";

const evolutionRoute: FastifyPluginAsync = async (app: FastifyInstance) => {

    app.post("/webhook", evolutionController.webhook);
    app.post("/webhook/*", evolutionController.webhook);

};

export default evolutionRoute;
