import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { gastoController } from "../controllers/gasto.controller.js";

const gastoRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
    // app.addHook("preHandler", verifySupabaseJWT);

    app.post("/", gastoController.create);
    app.put("/:id", gastoController.update);
    app.delete("/:id", gastoController.delete);
    app.get("/:id", gastoController.get);
    app.get("/usuario/:usuarioId", gastoController.listByUsuario);
};

export default gastoRoute;
