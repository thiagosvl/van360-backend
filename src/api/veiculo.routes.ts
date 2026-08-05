import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { veiculoController } from "../controllers/veiculo.controller.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.middleware.js";


const veiculoRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
    app.addHook("onRequest", authenticate);

    // CRUD Básico (Apenas quem tem veiculos.gerenciar)
    app.post("/", { preHandler: [requirePermission("veiculos.gerenciar")] }, veiculoController.create);
    app.put("/:id", { preHandler: [requirePermission("veiculos.gerenciar")] }, veiculoController.update);
    app.delete("/:id", { preHandler: [requirePermission("veiculos.gerenciar")] }, veiculoController.delete);
    app.get("/:id", { preHandler: [requirePermission("veiculos.gerenciar")] }, veiculoController.get);

    // Listagens e Contagens
    app.get("/usuario/:usuarioId", { preHandler: [requirePermission("veiculos.gerenciar", "rotas.visualizar", "gastos.visualizar")] }, veiculoController.listByUsuario);
    app.get("/usuario/:usuarioId/com-contagem", { preHandler: [requirePermission("veiculos.gerenciar", "rotas.visualizar", "gastos.visualizar")] }, veiculoController.listWithContagem);
    app.get("/usuario/:usuarioId/contagem", { preHandler: [requirePermission("veiculos.gerenciar", "rotas.visualizar", "gastos.visualizar")] }, veiculoController.countByUsuario);

    // Ações Específicas
    app.patch("/:id/toggle-ativo", { preHandler: [requirePermission("veiculos.gerenciar")] }, veiculoController.toggleAtivo);
};

export default veiculoRoute;
