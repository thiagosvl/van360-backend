import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { routeController } from "../controllers/route.controller.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.middleware.js";

const routeRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook("onRequest", authenticate);

  // CRUD Estático das Rotas
  app.post("/", { preHandler: [requirePermission("rotas.criar_editar")] }, routeController.create);
  app.put("/:id", { preHandler: [requirePermission("rotas.criar_editar")] }, routeController.update);
  app.delete("/:id", { preHandler: [requirePermission("rotas.excluir")] }, routeController.delete);
  app.get("/:id", { preHandler: [requirePermission("rotas.visualizar")] }, routeController.get);
  app.get("/usuario/:usuarioId", { preHandler: [requirePermission("rotas.visualizar")] }, routeController.listByUsuario);

  // Execuções Diárias de Rotas
  app.get("/execucoes/usuario/:usuarioId", { preHandler: [requirePermission("rotas.visualizar")] }, routeController.listExecucoesByUsuario);
  app.get("/execucoes/:id", { preHandler: [requirePermission("rotas.visualizar")] }, routeController.getExecucaoDetail);
  app.post("/:id/iniciar", { preHandler: [requirePermission("rotas.iniciar_encerrar")] }, routeController.iniciarRota);
  app.post("/execucoes/:id/parada", { preHandler: [requirePermission("rotas.executar_paradas")] }, routeController.atualizarParadaStatus);
  app.post("/execucoes/:id/reordenar", { preHandler: [requirePermission("rotas.criar_editar")] }, routeController.reordenarExecucao);
  app.post("/execucoes/:id/cancelar", { preHandler: [requirePermission("rotas.iniciar_encerrar")] }, routeController.cancelarExecucao);
  app.post("/execucoes/:id/finalizar", { preHandler: [requirePermission("rotas.iniciar_encerrar")] }, routeController.finalizarExecucao);

  // Ausências Antecipadas
  app.post("/ausencias", { preHandler: [requirePermission("rotas.executar_paradas")] }, routeController.createAusencia);
  app.delete("/ausencias/:id", { preHandler: [requirePermission("rotas.executar_paradas")] }, routeController.deleteAusencia);
  app.get("/:id/ausencias", { preHandler: [requirePermission("rotas.visualizar")] }, routeController.listAusencias);
  app.get("/passageiros/:id/ausencias", { preHandler: [requirePermission("rotas.visualizar")] }, routeController.listAusenciasByPassageiro);
  app.get("/passageiros/:id/rotas", { preHandler: [requirePermission("rotas.visualizar")] }, routeController.listRotasByPassageiro);
};

export default routeRoutes;
