import { planoService } from "../services/plano.service.js";
const planoRoute = async (app) => {
    // app.addHook("preHandler", verifySupabaseJWT);
    app.get("/", async (request, reply) => {
        const filtros = request.query;
        try {
            const planos = await planoService.listPlanos(filtros);
            return reply.status(200).send(planos);
        }
        catch (err) {
            return reply.status(404).send({ error: err.message });
        }
    });
    app.post("/calcular-preco-preview", async (request, reply) => {
        try {
            const { quantidade } = request.body;
            if (!quantidade || typeof quantidade !== "number") {
                return reply.status(400).send({
                    error: "Quantidade é obrigatória e deve ser um número",
                });
            }
            const resultado = await planoService.calcularPrecoPreview(quantidade);
            return reply.status(200).send(resultado ? { preco: resultado.precoTotal, valorPorCobranca: resultado.valorPorCobranca } : { preco: null });
        }
        catch (err) {
            return reply.status(500).send({ error: err.message });
        }
    });
};
export default planoRoute;
