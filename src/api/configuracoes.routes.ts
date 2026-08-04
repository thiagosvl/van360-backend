import { FastifyInstance } from "fastify";
import { ConfiguracoesController } from "../controllers/configuracoes.controller.js";
import { verifySupabaseJWT } from "../middleware/auth.js";

export default async function configuracoesRoutes(app: FastifyInstance) {
  app.get(
    "/usuarios/configuracoes",
    { onRequest: [verifySupabaseJWT] },
    ConfiguracoesController.obterConfiguracoes
  );

  app.put(
    "/usuarios/configuracoes",
    { onRequest: [verifySupabaseJWT] },
    ConfiguracoesController.atualizarConfiguracoes
  );

  app.patch(
    "/usuarios/configuracoes",
    { onRequest: [verifySupabaseJWT] },
    ConfiguracoesController.atualizarConfiguracoes
  );
}
