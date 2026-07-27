import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { gastoCategoriaController } from "../controllers/gasto-categoria.controller.js";
import { authenticate } from "../middleware/auth.js";

const gastoCategoriaRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
    app.addHook("onRequest", authenticate);

    app.get("/", gastoCategoriaController.list);
    app.post("/", gastoCategoriaController.create);
    app.put("/:id", gastoCategoriaController.update);
    app.delete("/:id", gastoCategoriaController.delete);
};

export default gastoCategoriaRoute;
