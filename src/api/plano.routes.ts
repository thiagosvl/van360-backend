import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { planoController } from "../controllers/plano.controller.js";

const planoRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
    // app.addHook("preHandler", verifySupabaseJWT);

    app.get("/", planoController.list);
    app.post("/calcular-preco-preview", planoController.calcularPrecoPreview);
};

export default planoRoute;
