import { FastifyInstance } from "fastify";
import { PublicController } from "../controllers/public.controller.js";

export default async function publicRoutes(app: FastifyInstance) {
    app.get("/motoristas/:id/validate", PublicController.validateMotorista);
}
