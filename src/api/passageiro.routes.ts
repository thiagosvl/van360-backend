import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { cobrancaService } from "../services/cobranca.service.js";
import { passageiroService } from "../services/passageiro.service.js";

const passageiroRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
    // app.addHook("preHandler", verifySupabaseJWT);

    app.post("/", async (request: any, reply) => {
        const data = request.body as any;

        try {
            const result = await passageiroService.createPassageiro(data);
            return reply.status(201).send(result);
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

    app.put("/:id", async (request: any, reply) => {
        const passageiroId = request.params["id"] as string;
        const data = request.body as any;

        try {
            await passageiroService.updatePassageiro(passageiroId, data);
            return reply.status(200).send({ success: true });
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

    app.delete("/:id", async (request: any, reply) => {
        const passageiroId = request.params["id"] as string;

        try {
            await passageiroService.deletePassageiro(passageiroId);
            return reply.status(200).send({ success: true });
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

    app.get("/:id", async (request: any, reply) => {
        const passageiroId = request.params["id"] as string;

        try {
            const passageiro = await passageiroService.getPassageiro(passageiroId);
            return reply.status(200).send(passageiro);
        } catch (err: any) {
            return reply.status(404).send({ error: err.message });
        }
    });

    app.get("/usuario/:usuarioId", async (request: any, reply) => {
        const usuarioId = request.params["usuarioId"] as string;
        const filtros = request.query;

        try {
            const passageiros = await passageiroService.listPassageiros(usuarioId, filtros);
            return reply.status(200).send(passageiros);
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

    app.patch("/:id/toggle-ativo", async (request: any, reply) => {
        const passageiroId = request.params["id"] as string;
        const { novoStatus } = request.body as { novoStatus: boolean };

        try {
            await passageiroService.toggleAtivo(passageiroId, novoStatus);
            return reply.status(200).send({ ativo: novoStatus });
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

    app.get("/:id/numero-cobrancas", async (request: any, reply) => {
        const passageiroId = request.params["id"] as string;

        try {
            const count = await cobrancaService.countByPassageiro(passageiroId);
            return reply.status(200).send({ numeroCobrancas: count });
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

    app.get("/usuario/:usuarioId/contagem", async (request: any, reply) => {
        const usuarioId = request.params["usuarioId"] as string;
        const filtros = request.query;
        try {
            const count = await passageiroService.countListPassageirosByUsuario(usuarioId, filtros);
            return reply.status(200).send({ count });
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

    app.post("/finalize-pre-cadastro/:prePassageiroId", async (request: any, reply) => {
        const prePassageiroId = request.params["prePassageiroId"] as string;
        const { data, usuarioId, emitir_cobranca_mes_atual } = request.body as any;

        try {
            const result = await passageiroService.finalizePreCadastro(
                prePassageiroId,
                data,
                usuarioId,
                emitir_cobranca_mes_atual
            );
            return reply.status(201).send(result);
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

};

export default passageiroRoute;
