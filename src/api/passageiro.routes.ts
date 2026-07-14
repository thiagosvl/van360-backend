import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { passageiroController } from "../controllers/passageiro.controller.js";
import { authenticate } from "../middleware/auth.js";

const passageiroRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
    app.addHook("onRequest", authenticate);

    // Rotas CRUD Básicas
    app.post("/", passageiroController.create);
    app.put("/:id", passageiroController.update);
    app.delete("/:id", passageiroController.delete);
    app.get("/:id", passageiroController.get);

    // Listagens e Contagens
    app.get("/usuario/:usuarioId", passageiroController.listByUsuario);
    app.get("/usuario/:usuarioId/contagem", passageiroController.countByUsuario);
    app.get("/:id/numero-cobrancas", passageiroController.countCobrancas);
    app.get("/responsavel/lookup", passageiroController.lookupResponsavel);

    // Ações Específicas
    app.patch("/:id/toggle-ativo", passageiroController.toggleAtivo);
    app.post("/finalizar-pre-cadastro/:prePassageiroId", passageiroController.finalizePreCadastro);

    // Responsáveis Adicionais
    app.post("/:id/responsaveis", passageiroController.addResponsavelAdicional);
    app.put("/responsaveis/:responsavelId", passageiroController.updateResponsavelAdicional);
    app.delete("/responsaveis/:responsavelId", passageiroController.deleteResponsavelAdicional);
    app.patch("/:id/responsaveis/:responsavelId/set-principal", passageiroController.setPrincipalResponsavel);

    // Aniversários
    app.get("/aniversariantes", passageiroController.getAniversariantesDoMes);
};

export default passageiroRoute;
