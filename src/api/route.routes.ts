import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { routeController } from "../controllers/route.controller.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.middleware.js";
import { RoutePermission } from "../types/enums.js";

const routeRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook("onRequest", authenticate);

  // CRUD Estático das Rotas
  app.post("/", { preHandler: [requirePermission(RoutePermission.CRIAR_EDITAR)] }, routeController.create);
  app.put("/:id", { preHandler: [requirePermission(RoutePermission.CRIAR_EDITAR)] }, routeController.update);
  app.delete("/:id", { preHandler: [requirePermission(RoutePermission.EXCLUIR)] }, routeController.delete);
  app.get("/:id", { preHandler: [requirePermission(RoutePermission.VISUALIZAR)] }, routeController.get);
  app.get("/usuario/:usuarioId", { preHandler: [requirePermission(RoutePermission.VISUALIZAR)] }, routeController.listByUsuario);

  // Execuções Diárias de Rotas
  app.get("/execucoes/usuario/:usuarioId", { preHandler: [requirePermission(RoutePermission.VISUALIZAR)] }, routeController.listExecucoesByUsuario);
  app.get("/execucoes/ativa-veiculo/:veiculoId", { preHandler: [requirePermission(RoutePermission.VISUALIZAR)] }, routeController.getExecucaoAtivaByVeiculo);
  app.get("/execucoes/:id", { preHandler: [requirePermission(RoutePermission.VISUALIZAR)] }, routeController.getExecucaoDetail);
  app.post("/:id/iniciar", { preHandler: [requirePermission(RoutePermission.INICIAR_ENCERRAR)] }, routeController.iniciarRota);
  app.post("/execucoes/:id/parada", { preHandler: [requirePermission(RoutePermission.EXECUTAR_PARADAS)] }, routeController.atualizarParadaStatus);
  app.post("/execucoes/:id/reordenar", { preHandler: [requirePermission(RoutePermission.EXECUTAR_PARADAS, RoutePermission.INICIAR_ENCERRAR, RoutePermission.CRIAR_EDITAR)] }, routeController.reordenarExecucao);
  app.post("/execucoes/:id/cancelar", { preHandler: [requirePermission(RoutePermission.INICIAR_ENCERRAR)] }, routeController.cancelarExecucao);
  app.post("/execucoes/:id/finalizar", { preHandler: [requirePermission(RoutePermission.EXECUTAR_PARADAS)] }, routeController.finalizarExecucao);

  // Ausências Antecipadas
  app.post("/ausencias", { preHandler: [requirePermission(RoutePermission.EXECUTAR_PARADAS)] }, routeController.createAusencia);
  app.delete("/ausencias/:id", { preHandler: [requirePermission(RoutePermission.EXECUTAR_PARADAS)] }, routeController.deleteAusencia);
  app.get("/:id/ausencias", { preHandler: [requirePermission(RoutePermission.VISUALIZAR)] }, routeController.listAusencias);
  app.get("/passageiros/:id/ausencias", { preHandler: [requirePermission(RoutePermission.VISUALIZAR)] }, routeController.listAusenciasByPassageiro);
  app.get("/passageiros/:id/rotas", { preHandler: [requirePermission(RoutePermission.VISUALIZAR)] }, routeController.listRotasByPassageiro);
};

export default routeRoutes;
