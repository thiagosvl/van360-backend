import { escolaService } from "../services/escola.service.js";
const escolaRoute = async (app) => {
    // app.addHook("preHandler", verifySupabaseJWT);
    app.post("/", async (request, reply) => {
        const data = request.body;
        try {
            const result = await escolaService.createEscola(data);
            return reply.status(201).send(result);
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
    app.put("/:id", async (request, reply) => {
        const escolaId = request.params["id"];
        const data = request.body;
        try {
            await escolaService.updateEscola(escolaId, data);
            return reply.status(200).send({ success: true });
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
    app.delete("/:id", async (request, reply) => {
        const escolaId = request.params["id"];
        try {
            await escolaService.deleteEscola(escolaId);
            return reply.status(200).send({ success: true });
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
    app.get("/:id", async (request, reply) => {
        const escolaId = request.params["id"];
        try {
            const escola = await escolaService.getEscola(escolaId);
            return reply.status(200).send(escola);
        }
        catch (err) {
            return reply.status(404).send({ error: err.message });
        }
    });
    app.get("/usuario/:usuarioId", async (request, reply) => {
        const usuarioId = request.params["usuarioId"];
        const filtros = request.query;
        try {
            const escolas = await escolaService.listEscolas(usuarioId, filtros);
            return reply.status(200).send(escolas);
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
    app.get("/usuario/:usuarioId/com-contagem", async (request, reply) => {
        const usuarioId = request.params["usuarioId"];
        try {
            const escolas = await escolaService.listEscolasComContagemAtivos(usuarioId);
            return reply.status(200).send(escolas);
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
    app.get("/usuario/:usuarioId/contagem", async (request, reply) => {
        const usuarioId = request.params["usuarioId"];
        try {
            const count = await escolaService.countListEscolasByUsuario(usuarioId);
            return reply.status(200).send({ count });
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
    app.patch("/:id/toggle-ativo", async (request, reply) => {
        const escolaId = request.params["id"];
        const { novoStatus } = request.body;
        try {
            await escolaService.toggleAtivo(escolaId, novoStatus);
            return reply.status(200).send({ ativo: novoStatus });
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
};
export default escolaRoute;
