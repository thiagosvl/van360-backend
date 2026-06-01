import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { routeController } from "../controllers/route.controller.js";
import { authenticate } from "../middleware/auth.js";

const routeRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook("onRequest", authenticate);

  // CRUD Estático das Rotas
  app.post("/", routeController.create);
  app.put("/:id", routeController.update);
  app.delete("/:id", routeController.delete);
  app.get("/:id", routeController.get);
  app.get("/usuario/:usuarioId", routeController.listByUsuario);

  // Execuções Diárias de Rotas
  app.get("/execucoes/usuario/:usuarioId", routeController.listExecucoesByUsuario);
  app.get("/execucoes/:id", routeController.getExecucaoDetail);
  app.post("/:id/iniciar", routeController.iniciarRota);
  app.post("/execucoes/:id/parada", routeController.atualizarParadaStatus);
  app.post("/execucoes/:id/cancelar", routeController.cancelarExecucao);
};

export default routeRoutes;
