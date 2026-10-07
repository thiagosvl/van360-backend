import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { fretamentoController } from "../controllers/fretamento.controller.js";
import { authenticate } from "../middleware/auth.js";

const fretamentoRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get("/publico/:slug", fretamentoController.obterPublicoPorSlug);
  app.post("/publico/:slug/inscrever", fretamentoController.adicionarParticipantePublico);

  app.register(async (privateApp) => {
    privateApp.addHook("onRequest", authenticate);

    privateApp.get("/", fretamentoController.listar);
    privateApp.get("/resumo-financeiro", fretamentoController.resumoFinanceiro);
    privateApp.get("/:id", fretamentoController.obterPorId);
    privateApp.post("/", fretamentoController.criar);
    privateApp.put("/:id", fretamentoController.atualizar);
    privateApp.delete("/:id", fretamentoController.deletar);

    privateApp.post("/:id/pagamentos", fretamentoController.registrarPagamento);
    privateApp.delete("/:id/pagamentos/:pagamentoId", fretamentoController.deletarPagamento);

    privateApp.post("/:id/participantes", fretamentoController.adicionarParticipante);
    privateApp.patch("/:id/participantes/:participanteId", fretamentoController.atualizarStatusParticipante);
    privateApp.delete("/:id/participantes/:participanteId", fretamentoController.removerParticipante);
  });
};

export default fretamentoRoutes;
