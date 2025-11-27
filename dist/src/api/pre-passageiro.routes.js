import { prePassageiroService } from "../services/pre-passageiro.service.js";
const prePassageiroRoute = async (app) => {
    app.get("/usuario/:usuarioId", async (request, reply) => {
        const usuarioId = request.params.usuarioId;
        const { search } = request.query;
        try {
            const prePassageiros = await prePassageiroService.listPrePassageiros(usuarioId, search);
            return reply.status(200).send(prePassageiros);
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
    app.post("/", async (request, reply) => {
        const data = request.body;
        try {
            const prePassageiro = await prePassageiroService.createPrePassageiro(data);
            return reply.status(201).send(prePassageiro);
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
    app.delete("/:id", async (request, reply) => {
        const prePassageiroId = request.params.id;
        try {
            await prePassageiroService.deletePrePassageiro(prePassageiroId);
            return reply.status(200).send({ success: true });
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
};
export default prePassageiroRoute;
