import { gastoService } from "../services/gasto.service.js";
const gastoRoute = async (app) => {
    // app.addHook("preHandler", verifySupabaseJWT);
    app.post("/", async (request, reply) => {
        const data = request.body;
        try {
            const result = await gastoService.createGasto(data);
            return reply.status(201).send(result);
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
    app.put("/:id", async (request, reply) => {
        const gastoId = request.params["id"];
        const data = request.body;
        try {
            await gastoService.updateGasto(gastoId, data);
            return reply.status(200).send({ success: true });
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
    app.delete("/:id", async (request, reply) => {
        const gastoId = request.params["id"];
        try {
            await gastoService.deleteGasto(gastoId);
            return reply.status(200).send({ success: true });
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
    app.get("/:id", async (request, reply) => {
        const gastoId = request.params["id"];
        try {
            const gasto = await gastoService.getGasto(gastoId);
            return reply.status(200).send(gasto);
        }
        catch (err) {
            return reply.status(404).send({ error: err.message });
        }
    });
    app.get("/usuario/:usuarioId", async (request, reply) => {
        const usuarioId = request.params["usuarioId"];
        const filtros = request.query;
        try {
            const gastos = await gastoService.listGastos(usuarioId, filtros);
            return reply.status(200).send(gastos);
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
};
export default gastoRoute;
