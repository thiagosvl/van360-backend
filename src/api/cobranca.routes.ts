import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { cobrancaController } from "../controllers/cobranca.controller.js";
import { authenticate } from "../middleware/auth.js";


const cobrancaRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
    app.addHook("onRequest", authenticate);

    // CRUD Básico
    app.post("/", cobrancaController.create);
    app.put("/:id", cobrancaController.update);
    app.delete("/:id", cobrancaController.delete);
    app.get("/:id", cobrancaController.get);
    app.get("/", cobrancaController.listWithFilters);

    // Contexto de Passageiro
    app.get("/passageiro/:passageiroId", cobrancaController.listByPassageiro);
    app.get("/passageiro/:passageiroId/count", cobrancaController.countByPassageiro);


    // Notificações
    app.get("/:cobrancaId/notificacoes", cobrancaController.listNotificacoes);
    app.patch("/:id/toggle-notificacoes", cobrancaController.toggleNotificacoes);
    app.post("/:id/desfazer-pagamento-manual", cobrancaController.desfazerPagamentoManual);
    app.post("/:id/registrar-pagamento-manual", cobrancaController.registrarPagamentoManual);
};

export default cobrancaRoute;
