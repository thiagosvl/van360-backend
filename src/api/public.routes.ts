import { FastifyInstance } from "fastify";
import { PublicController } from "../controllers/public.controller.js";
import { subscriptionController } from "../controllers/subscription.controller.js";

export default async function publicRoutes(app: FastifyInstance) {
    app.get("/motoristas/:id/validate", PublicController.validateMotorista);
    
    /**
     * Planos SaaS públicos (usado na Landing Page)
     */
    app.get("/subscriptions/plans", subscriptionController.listPlans);
}
