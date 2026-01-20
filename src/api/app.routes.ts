import { FastifyInstance } from "fastify";
import { AppController } from "../controllers/app.controller.js";

export default async function appRoutes(app: FastifyInstance) {
    app.get("/updates", AppController.checkUpdates);
}
