import { logger } from "../config/logger.js";
import { assinaturaCobrancaService } from "../services/assinatura-cobranca.service.js";
const assinaturaCobrancaRoute = async (app) => {
    app.get("/:id", async (request, reply) => {
        try {
            const id = request.params.id;
            const result = await assinaturaCobrancaService.getAssinaturaCobranca(id);
            return reply.status(200).send(result);
        }
        catch (err) {
            return reply.status(404).send({ error: err.message });
        }
    });
    app.get("/", async (request, reply) => {
        const filtros = request.query;
        try {
            const result = await assinaturaCobrancaService.listAssinaturaCobrancas(filtros);
            return reply.status(200).send(result);
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
    app.post("/:id/gerar-pix", async (request, reply) => {
        const cobrancaId = request.params.id;
        try {
            const result = await assinaturaCobrancaService.gerarPixParaCobranca(cobrancaId);
            return reply.status(200).send(result);
        }
        catch (err) {
            logger.error({ error: err.message, cobrancaId }, "Erro ao gerar PIX para cobrança");
            const statusCode = err.message.includes("não encontrada")
                ? 404
                : err.message.includes("não está pendente")
                    ? 400
                    : 500;
            return reply.status(statusCode).send({ error: err.message });
        }
    });
};
export default assinaturaCobrancaRoute;
