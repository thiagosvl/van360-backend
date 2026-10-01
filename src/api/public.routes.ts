import { FastifyInstance } from "fastify";
import { PublicController } from "../controllers/public.controller.js";
import { subscriptionController } from "../controllers/subscription.controller.js";
import { publicBlogController } from "../controllers/blog.controller.js";
import { renovacaoController } from "../controllers/renovacao.controller.js";

export default async function publicRoutes(app: FastifyInstance) {
    app.get("/motoristas/:id/validate", PublicController.validateMotorista);
    app.get("/motoristas/:id/escolas", PublicController.listEscolas);
    
    /**
     * Planos SaaS públicos (usado na Landing Page)
     */
    app.get("/subscriptions/plans", subscriptionController.listPlans);

    // Rotas Públicas do Blog
    app.get("/blog/posts", publicBlogController.list);
    app.get("/blog/posts/:slug", publicBlogController.get);

    // Rotas Públicas de Renovação (Portal dos Pais)
    app.get("/renovacao/:token", renovacaoController.getPublic);
    app.patch("/renovacao/:token/dados", renovacaoController.atualizarDadosPublicos);
    app.post("/renovacao/:token/responder", renovacaoController.responderPublic);
}

