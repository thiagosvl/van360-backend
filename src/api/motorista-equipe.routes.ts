import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.middleware.js";
import { motoristaEquipeController } from "../controllers/motorista-equipe.controller.js";

export const motoristaEquipeRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook("onRequest", authenticate);

  app.get(
    "/",
    { preHandler: [requirePermission("equipe.gerenciar_monitores")] },
    motoristaEquipeController.list
  );

  app.post(
    "/",
    { preHandler: [requirePermission("equipe.gerenciar_monitores")] },
    motoristaEquipeController.create
  );

  app.put(
    "/:id",
    { preHandler: [requirePermission("equipe.gerenciar_monitores")] },
    motoristaEquipeController.update
  );

  app.post(
    "/:id/redefinir-senha",
    { preHandler: [requirePermission("equipe.gerenciar_monitores")] },
    motoristaEquipeController.redefinirSenha
  );

  app.patch(
    "/:id/status",
    { preHandler: [requirePermission("equipe.gerenciar_todos")] },
    motoristaEquipeController.desativar
  );

  app.delete(
    "/:id",
    { preHandler: [requirePermission("equipe.gerenciar_todos")] },
    motoristaEquipeController.delete
  );
};

export default motoristaEquipeRoutes;
