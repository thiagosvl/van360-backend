import { FastifyInstance } from "fastify";
import { ConfiguracoesController } from "../controllers/configuracoes.controller.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.middleware.js";

export default async function configuracoesRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  app.get(
    "/usuarios/configuracoes",
    { preHandler: [requirePermission("financeiro.visualizar")] },
    ConfiguracoesController.obterConfiguracoes
  );

  app.put(
    "/usuarios/configuracoes",
    { preHandler: [requirePermission("cobrancas.gerenciar")] },
    ConfiguracoesController.atualizarConfiguracoes
  );

  app.patch(
    "/usuarios/configuracoes",
    { preHandler: [requirePermission("cobrancas.gerenciar")] },
    ConfiguracoesController.atualizarConfiguracoes
  );
}

