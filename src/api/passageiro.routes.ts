import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { passageiroController } from "../controllers/passageiro.controller.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.middleware.js";

import { portalResponsavelController } from "../controllers/portal-responsavel.controller.js";

const passageiroRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
    app.addHook("onRequest", authenticate);

    // Rotas CRUD Básicas (Gerenciar = Apenas Gestor)
    app.post("/", { preHandler: [requirePermission("passageiros.gerenciar")] }, passageiroController.create);
    app.put("/:id", { preHandler: [requirePermission("passageiros.gerenciar")] }, passageiroController.update);
    app.delete("/:id", { preHandler: [requirePermission("passageiros.gerenciar")] }, passageiroController.delete);
    app.get("/:id", { preHandler: [requirePermission("passageiros.visualizar")] }, passageiroController.get);

    // Listagens (Visualizar = Gestor, Auxiliar e Monitor)
    app.get("/usuario/:usuarioId", { preHandler: [requirePermission("passageiros.visualizar")] }, passageiroController.listByUsuario);
    app.get("/responsavel/lookup", { preHandler: [requirePermission("passageiros.visualizar")] }, passageiroController.lookupResponsavel);

    // Ações Específicas
    app.patch("/:id/toggle-ativo", { preHandler: [requirePermission("passageiros.gerenciar")] }, passageiroController.toggleAtivo);
    app.post("/finalizar-pre-cadastro/:prePassageiroId", { preHandler: [requirePermission("passageiros.gerenciar")] }, passageiroController.finalizePreCadastro);
    app.post("/:id/reset-pin", { preHandler: [requirePermission("passageiros.gerenciar")] }, portalResponsavelController.resetPinByDriver);

    // Responsáveis Adicionais
    app.post("/:id/responsaveis", { preHandler: [requirePermission("passageiros.gerenciar")] }, passageiroController.addResponsavelAdicional);
    app.put("/responsaveis/:responsavelId", { preHandler: [requirePermission("passageiros.gerenciar")] }, passageiroController.updateResponsavelAdicional);
    app.delete("/responsaveis/:responsavelId", { preHandler: [requirePermission("passageiros.gerenciar")] }, passageiroController.deleteResponsavelAdicional);
    app.patch("/:id/responsaveis/:responsavelId/set-principal", { preHandler: [requirePermission("passageiros.gerenciar")] }, passageiroController.setPrincipalResponsavel);

    // Aniversários
    app.get("/aniversariantes", { preHandler: [requirePermission("aniversarios.visualizar")] }, passageiroController.getAniversariantesDoMes);
};

export default passageiroRoute;
