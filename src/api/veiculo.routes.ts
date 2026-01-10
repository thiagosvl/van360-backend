import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { veiculoController } from "../controllers/veiculo.controller.js";

const veiculoRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
    // CRUD Básico
    app.post("/", veiculoController.create);
    app.put("/:id", veiculoController.update);
    app.delete("/:id", veiculoController.delete);
    app.get("/:id", veiculoController.get);

    // Listagens e Contagens
    app.get("/usuario/:usuarioId", veiculoController.listByUsuario);
    app.get("/usuario/:usuarioId/com-contagem", veiculoController.listWithContagem);
    app.get("/usuario/:usuarioId/contagem", veiculoController.countByUsuario);

    // Ações Específicas
    app.patch("/:id/toggle-ativo", veiculoController.toggleAtivo);
};

export default veiculoRoute;
