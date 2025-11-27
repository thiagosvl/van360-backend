import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { escolaService } from "../services/escola.service";

const escolaRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
    // app.addHook("preHandler", verifySupabaseJWT);

    app.post("/", async (request: any, reply) => {
        const data = request.body as any;
        try {
            const result = await escolaService.createEscola(data);
            return reply.status(201).send(result);
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

    app.put("/:id", async (request: any, reply) => {
        const escolaId = request.params["id"] as string;
        const data = request.body as any;
        try {
            await escolaService.updateEscola(escolaId, data);
            return reply.status(200).send({ success: true });
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

    app.delete("/:id", async (request: any, reply) => {
        const escolaId = request.params["id"] as string;
        try {
            await escolaService.deleteEscola(escolaId);
            return reply.status(200).send({ success: true });
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

    app.get("/:id", async (request: any, reply) => {
        const escolaId = request.params["id"] as string;
        try {
            const escola = await escolaService.getEscola(escolaId);
            return reply.status(200).send(escola);
        } catch (err: any) {
            return reply.status(404).send({ error: err.message });
        }
    });

    app.get("/usuario/:usuarioId", async (request: any, reply) => {
        const usuarioId = request.params["usuarioId"] as string;
        const filtros = request.query;
        try {
            const escolas = await escolaService.listEscolas(usuarioId, filtros);
            return reply.status(200).send(escolas);
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

    app.get("/usuario/:usuarioId/com-contagem", async (request: any, reply) => {
        const usuarioId = request.params["usuarioId"] as string;
        try {
            const escolas = await escolaService.listEscolasComContagemAtivos(usuarioId);
            return reply.status(200).send(escolas);
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

    app.get("/usuario/:usuarioId/contagem", async (request: any, reply) => {
        const usuarioId = request.params["usuarioId"] as string;
        try {
            const count = await escolaService.countListEscolasByUsuario(usuarioId);
            return reply.status(200).send({ count });
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

    app.patch("/:id/toggle-ativo", async (request: any, reply) => {
        const escolaId = request.params["id"] as string;
        const { novoStatus } = request.body as { novoStatus: boolean };
        try {
            await escolaService.toggleAtivo(escolaId, novoStatus);
            return reply.status(200).send({ ativo: novoStatus });
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });
};

export default escolaRoute;
