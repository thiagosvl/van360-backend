import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { assinaturaCobrancaController } from "../controllers/assinatura-cobranca.controller.js";

const assinaturaCobrancaRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
    app.get("/:id", assinaturaCobrancaController.get);
    app.get("/:id/status", assinaturaCobrancaController.checkStatus);
    app.get("/", assinaturaCobrancaController.list);
    app.post("/:id/gerar-pix", assinaturaCobrancaController.gerarPix);
};

export default assinaturaCobrancaRoute;
