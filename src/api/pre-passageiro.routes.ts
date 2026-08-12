import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { prePassageiroController } from "../controllers/pre-passageiro.controller.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.middleware.js";

const prePassageiroRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Rota pública de pré-cadastro formulário
  app.post("/", prePassageiroController.create);

  // Rotas gerenciais do motorista/equipe (requerem autenticação e permissão)
  app.get(
    "/usuario/:usuarioId",
    { preHandler: [authenticate, requirePermission("passageiros.gerenciar")] },
    prePassageiroController.listByUsuario
  );

  app.delete(
    "/:id",
    { preHandler: [authenticate, requirePermission("passageiros.gerenciar")] },
    prePassageiroController.delete
  );
};

export default prePassageiroRoute;

