import { FastifyInstance } from "fastify";
import { PublicController } from "../controllers/public.controller.js";
import { ResponsavelController } from "../controllers/responsavel.controller.js";

export default async function publicRoutes(app: FastifyInstance) {
    app.get("/motoristas/:id/validate", PublicController.validateMotorista);
    
    // Responsavel Routes (Public/Semi-public)
    app.get("/responsavel/cobrancas/:passageiroId", ResponsavelController.getCobrancas);
    app.get("/responsavel/cobrancas/:passageiroId/anos", ResponsavelController.getAnosAvailable);
}
