import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { gastoCategoriaController } from "../controllers/gasto-categoria.controller.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.middleware.js";

const gastoCategoriaRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
    app.addHook("onRequest", authenticate);

    app.get("/", { preHandler: [requirePermission("gastos.visualizar")] }, gastoCategoriaController.list);
    app.post("/", { preHandler: [requirePermission("gastos.criar")] }, gastoCategoriaController.create);
    app.put("/:id", { preHandler: [requirePermission("gastos.criar")] }, gastoCategoriaController.update);
    app.delete("/:id", { preHandler: [requirePermission("gastos.criar")] }, gastoCategoriaController.delete);
};

export default gastoCategoriaRoute;
