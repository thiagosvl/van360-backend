import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { escolaController } from "../controllers/escola.controller.js";

const escolaRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
    // CRUD Básico
    app.post("/", escolaController.create);
    app.put("/:id", escolaController.update);
    app.delete("/:id", escolaController.delete);
    app.get("/:id", escolaController.get);

    // Listagens e Contagens
    app.get("/usuario/:usuarioId", escolaController.listByUsuario);
    app.get("/usuario/:usuarioId/com-contagem", escolaController.listWithContagem);
    app.get("/usuario/:usuarioId/contagem", escolaController.countByUsuario);

    // Ações Específicas
    app.patch("/:id/toggle-ativo", escolaController.toggleAtivo);
};

export default escolaRoute;
