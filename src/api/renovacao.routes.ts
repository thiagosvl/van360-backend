import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { renovacaoController } from "../controllers/renovacao.controller.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.middleware.js";

const renovacaoRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook("onRequest", authenticate);

  app.get(
    "/",
    { preHandler: [requirePermission("renovacoes.gerenciar")] },
    renovacaoController.getDashboard
  );

  app.get(
    "/config-contrato",
    { preHandler: [requirePermission("renovacoes.gerenciar")] },
    renovacaoController.getContratoConfig
  );

  app.put(
    "/config-contrato",
    { preHandler: [requirePermission("renovacoes.gerenciar")] },
    renovacaoController.salvarContratoConfig
  );

  app.post(
    "/reajuste-lote",
    { preHandler: [requirePermission("renovacoes.gerenciar")] },
    renovacaoController.reajusteLote
  );

  app.patch(
    "/reajuste-lote",
    { preHandler: [requirePermission("renovacoes.gerenciar")] },
    renovacaoController.reajusteLote
  );

  app.post(
    "/status-lote",
    { preHandler: [requirePermission("renovacoes.gerenciar")] },
    renovacaoController.atualizarStatusLote
  );

  app.put(
    "/:passageiroId",
    { preHandler: [requirePermission("renovacoes.gerenciar")] },
    renovacaoController.updateIndividual
  );

  app.post(
    "/:passageiroId/notificar",
    { preHandler: [requirePermission("renovacoes.gerenciar")] },
    renovacaoController.notificarIndividual
  );

  app.post(
    "/notificar-lote",
    { preHandler: [requirePermission("renovacoes.gerenciar")] },
    renovacaoController.notificarLote
  );
};

export default renovacaoRoutes;

