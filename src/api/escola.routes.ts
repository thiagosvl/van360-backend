import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { escolaController } from "../controllers/escola.controller.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.middleware.js";


const escolaRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
    app.addHook("onRequest", authenticate);

    // CRUD Básico
    app.post("/", { preHandler: [requirePermission("escolas.gerenciar")] }, escolaController.create);
    app.put("/:id", { preHandler: [requirePermission("escolas.gerenciar")] }, escolaController.update);
    app.delete("/:id", { preHandler: [requirePermission("escolas.gerenciar")] }, escolaController.delete);
    app.get("/:id", { preHandler: [requirePermission("escolas.visualizar", "escolas.gerenciar", "rotas.visualizar", "rotas.criar_editar")] }, escolaController.get);

    // Listagens e Contagens
    app.get("/usuario/:usuarioId", { preHandler: [requirePermission("escolas.visualizar", "escolas.gerenciar", "rotas.visualizar", "rotas.criar_editar")] }, escolaController.listByUsuario);
    app.get("/usuario/:usuarioId/com-contagem", { preHandler: [requirePermission("escolas.visualizar", "escolas.gerenciar", "rotas.visualizar", "rotas.criar_editar")] }, escolaController.listWithContagem);
    app.get("/usuario/:usuarioId/contagem", { preHandler: [requirePermission("escolas.visualizar", "escolas.gerenciar", "rotas.visualizar", "rotas.criar_editar")] }, escolaController.countByUsuario);

    // Ações Específicas
    app.patch("/:id/toggle-ativo", { preHandler: [requirePermission("escolas.gerenciar")] }, escolaController.toggleAtivo);
};

export default escolaRoute;
