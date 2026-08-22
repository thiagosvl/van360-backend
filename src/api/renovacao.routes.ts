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

  app.patch(
    "/reajuste-lote",
    { preHandler: [requirePermission("renovacoes.gerenciar")] },
    renovacaoController.reajusteLote
  );

  app.put(
    "/:passageiroId",
    { preHandler: [requirePermission("renovacoes.gerenciar")] },
    renovacaoController.updateIndividual
  );

  app.post(
    "/virar-ano",
    { preHandler: [requirePermission("renovacoes.gerenciar")] },
    renovacaoController.virarAno
  );
};

export default renovacaoRoutes;
