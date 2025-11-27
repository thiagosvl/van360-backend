import { veiculoService } from "../services/veiculo.service.js";
const veiculoRoute = async (app) => {
    // app.addHook("preHandler", verifySupabaseJWT);
    app.post("/", async (request, reply) => {
        const data = request.body;
        try {
            const result = await veiculoService.createVeiculo(data);
            return reply.status(201).send(result);
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
    app.put("/:id", async (request, reply) => {
        const veiculoId = request.params["id"];
        const data = request.body;
        try {
            await veiculoService.updateVeiculo(veiculoId, data);
            return reply.status(200).send({ success: true });
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
    app.delete("/:id", async (request, reply) => {
        const veiculoId = request.params["id"];
        try {
            await veiculoService.deleteVeiculo(veiculoId);
            return reply.status(200).send({ success: true });
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
    app.get("/:id", async (request, reply) => {
        const veiculoId = request.params["id"];
        try {
            const veiculo = await veiculoService.getVeiculo(veiculoId);
            return reply.status(200).send(veiculo);
        }
        catch (err) {
            return reply.status(404).send({ error: err.message });
        }
    });
    app.get("/usuario/:usuarioId", async (request, reply) => {
        const usuarioId = request.params["usuarioId"];
        const filtros = request.query;
        try {
            const veiculos = await veiculoService.listVeiculos(usuarioId, filtros);
            return reply.status(200).send(veiculos);
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
    app.get("/usuario/:usuarioId/com-contagem", async (request, reply) => {
        const usuarioId = request.params["usuarioId"];
        try {
            const veiculos = await veiculoService.listVeiculosComContagemAtivos(usuarioId);
            return reply.status(200).send(veiculos);
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
    app.get("/usuario/:usuarioId/contagem", async (request, reply) => {
        const usuarioId = request.params["usuarioId"];
        try {
            const count = await veiculoService.countListVeiculosByUsuario(usuarioId);
            return reply.status(200).send({ count });
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
    app.patch("/:id/toggle-ativo", async (request, reply) => {
        const veiculoId = request.params["id"];
        const { novoStatus } = request.body;
        try {
            await veiculoService.toggleAtivo(veiculoId, novoStatus);
            return reply.status(200).send({ ativo: novoStatus });
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
};
export default veiculoRoute;
