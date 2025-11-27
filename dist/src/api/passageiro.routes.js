import { cobrancaService } from "../services/cobranca.service.js";
import { passageiroService } from "../services/passageiro.service.js";
const passageiroRoute = async (app) => {
    // app.addHook("preHandler", verifySupabaseJWT);
    app.post("/", async (request, reply) => {
        const data = request.body;
        try {
            const result = await passageiroService.createPassageiro(data);
            return reply.status(201).send(result);
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
    app.put("/:id", async (request, reply) => {
        const passageiroId = request.params["id"];
        const data = request.body;
        try {
            await passageiroService.updatePassageiro(passageiroId, data);
            return reply.status(200).send({ success: true });
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
    app.delete("/:id", async (request, reply) => {
        const passageiroId = request.params["id"];
        try {
            await passageiroService.deletePassageiro(passageiroId);
            return reply.status(200).send({ success: true });
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
    app.get("/:id", async (request, reply) => {
        const passageiroId = request.params["id"];
        try {
            const passageiro = await passageiroService.getPassageiro(passageiroId);
            return reply.status(200).send(passageiro);
        }
        catch (err) {
            return reply.status(404).send({ error: err.message });
        }
    });
    app.get("/usuario/:usuarioId", async (request, reply) => {
        const usuarioId = request.params["usuarioId"];
        const filtros = request.query;
        try {
            const passageiros = await passageiroService.listPassageiros(usuarioId, filtros);
            return reply.status(200).send(passageiros);
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
    app.patch("/:id/toggle-ativo", async (request, reply) => {
        const passageiroId = request.params["id"];
        const { novoStatus } = request.body;
        try {
            await passageiroService.toggleAtivo(passageiroId, novoStatus);
            return reply.status(200).send({ ativo: novoStatus });
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
    app.get("/:id/numero-cobrancas", async (request, reply) => {
        const passageiroId = request.params["id"];
        try {
            const count = await cobrancaService.countByPassageiro(passageiroId);
            return reply.status(200).send({ numeroCobrancas: count });
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
    app.get("/usuario/:usuarioId/contagem", async (request, reply) => {
        const usuarioId = request.params["usuarioId"];
        const filtros = request.query;
        try {
            const count = await passageiroService.countListPassageirosByUsuario(usuarioId, filtros);
            return reply.status(200).send({ count });
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
    app.post("/finalize-pre-cadastro/:prePassageiroId", async (request, reply) => {
        const prePassageiroId = request.params["prePassageiroId"];
        const { data, usuarioId, emitir_cobranca_mes_atual } = request.body;
        try {
            const result = await passageiroService.finalizePreCadastro(prePassageiroId, data, usuarioId, emitir_cobranca_mes_atual);
            return reply.status(201).send(result);
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
};
export default passageiroRoute;
