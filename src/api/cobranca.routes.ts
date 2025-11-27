import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { cobrancaNotificacaoService } from "../services/cobranca-notificacao.service";
import { cobrancaService } from "../services/cobranca.service";

const cobrancaRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
    app.post("/", async (request: any, reply) => {
        try {
            const data = request.body;
            const result = await cobrancaService.createCobranca(data);
            return reply.status(201).send(result);
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

    app.put("/:id", async (request: any, reply) => {
        try {
            const id = request.params.id;
            const { data, cobrancaOriginal } = request.body as any;
            const result = await cobrancaService.updateCobranca(id, data, cobrancaOriginal);
            return reply.status(200).send(result);
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

    app.delete("/:id", async (request: any, reply) => {
        try {
            const id = request.params.id;
            await cobrancaService.deleteCobranca(id);
            return reply.status(200).send({ success: true });
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

    app.get("/:id", async (request: any, reply) => {
        try {
            const id = request.params.id;
            const result = await cobrancaService.getCobranca(id);
            return reply.status(200).send(result);
        } catch (err: any) {
            return reply.status(404).send({ error: err.message });
        }
    });

    app.get("/passageiro/:passageiroId", async (request: any, reply) => {
        try {
            const passageiroId = request.params.passageiroId;
            const { ano } = request.query;
            const result = await cobrancaService.listCobrancasByPassageiro(passageiroId, ano);
            return reply.status(200).send(result);
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

    app.get("/", async (request: any, reply) => {
        try {
            const filtros = request.query;
            const result = await cobrancaService.listCobrancasWithFilters(filtros);
            return reply.status(200).send(result);
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

    app.get("/passageiro/:passageiroId/count", async (request: any, reply) => {
        try {
            const passageiroId = request.params.passageiroId;
            const count = await cobrancaService.countByPassageiro(passageiroId);
            return reply.status(200).send({ count });
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

    app.get("/passageiro/:passageiroId/anos-disponiveis", async (request: any, reply) => {
        try {
            const passageiroId = request.params.passageiroId;
            const anos = await cobrancaService.listAvailableYearsByPassageiro(passageiroId);
            return reply.status(200).send(anos);
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

    app.get("/:cobrancaId/notificacoes", async (request: any, reply) => {
        try {
            const cobrancaId = request.params.cobrancaId;
            const notificacoes = await cobrancaNotificacaoService.listByCobrancaId(cobrancaId);
            return reply.status(200).send(notificacoes);
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

    app.post("/:cobrancaId/notificacoes", async (request: any, reply) => {
        try {
            const cobrancaId = request.params.cobrancaId;
            const payload = request.body;
            await cobrancaNotificacaoService.create(cobrancaId, payload);
            return reply.status(200).send({ success: true });
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

    app.patch("/:id/toggle-notificacoes", async (request: any, reply) => {
        const cobrancaId = request.params["id"] as string;
        const { novoStatus } = request.body as { novoStatus: boolean };

        try {
            await cobrancaService.toggleNotificacoes(cobrancaId, novoStatus);
            return reply.status(200).send({ ativo: novoStatus });
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });
};

export default cobrancaRoute;
