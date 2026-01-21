import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { cobrancaController } from "../controllers/cobranca.controller.js";

const cobrancaRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
    // CRUD Básico
    app.post("/", cobrancaController.create);
    app.put("/:id", cobrancaController.update);
    app.delete("/:id", cobrancaController.delete);
    app.get("/:id", cobrancaController.get);
    app.get("/", cobrancaController.listWithFilters);

    // Contexto de Passageiro
    app.get("/passageiro/:passageiroId", cobrancaController.listByPassageiro);
    app.get("/passageiro/:passageiroId/count", cobrancaController.countByPassageiro);
    app.get("/passageiro/:passageiroId/anos-disponiveis", cobrancaController.listAvailableYears);

    // Notificações
    app.get("/:cobrancaId/notificacoes", cobrancaController.listNotificacoes);
    app.post("/:cobrancaId/notificacoes", cobrancaController.createNotificacao);
    app.patch("/:id/toggle-notificacoes", cobrancaController.toggleNotificacoes);
    app.post("/:id/desfazer-pagamento-manual", cobrancaController.desfazerPagamentoManual);
};

export default cobrancaRoute;
