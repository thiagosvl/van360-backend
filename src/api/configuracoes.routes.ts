import { FastifyInstance } from "fastify";
import { ConfiguracoesController } from "../controllers/configuracoes.controller.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.middleware.js";

export default async function configuracoesRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  app.get(
    "/usuarios/configuracoes",
    ConfiguracoesController.obterConfiguracoes
  );

  app.put(
    "/usuarios/configuracoes",
    ConfiguracoesController.atualizarConfiguracoes
  );

  app.patch(
    "/usuarios/configuracoes",
    ConfiguracoesController.atualizarConfiguracoes
  );
}

