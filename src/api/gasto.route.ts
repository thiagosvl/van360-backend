import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { gastoController } from "../controllers/gasto.controller.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.middleware.js";

const gastoRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
    app.addHook("onRequest", authenticate);

    app.post("/", { preHandler: [requirePermission("gastos.criar")] }, gastoController.create);
    app.put("/:id", { preHandler: [requirePermission("gastos.criar")] }, gastoController.update);
    app.delete("/:id", { preHandler: [requirePermission("gastos.criar")] }, gastoController.delete);
    app.get("/:id", { preHandler: [requirePermission("gastos.visualizar")] }, gastoController.get);
    app.get("/usuario/:usuarioId", { preHandler: [requirePermission("gastos.visualizar")] }, gastoController.listByUsuario);
};

export default gastoRoute;
