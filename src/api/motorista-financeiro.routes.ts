import { FastifyInstance } from "fastify";
import { MotoristaFinanceiroController } from "../controllers/motorista-financeiro.controller.js";
import { authenticate } from "../middleware/auth.js";

export default async function motoristaFinanceiroRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  app.get(
    "/motorista/configuracoes-financeiras",
    MotoristaFinanceiroController.obterConfiguracoes
  );

  app.put(
    "/motorista/configuracoes-financeiras",
    MotoristaFinanceiroController.atualizarConfiguracoes
  );

  app.patch(
    "/motorista/configuracoes-financeiras",
    MotoristaFinanceiroController.atualizarConfiguracoes
  );
}
