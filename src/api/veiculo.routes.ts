import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { veiculoService } from "../services/veiculo.service.js";

const veiculoRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
    // app.addHook("preHandler", verifySupabaseJWT);

    app.post("/", async (request: any, reply) => {
        const data = request.body as any;
        try {
            const result = await veiculoService.createVeiculo(data);
            return reply.status(201).send(result);
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

    app.put("/:id", async (request: any, reply) => {
        const veiculoId = request.params["id"] as string;
        const data = request.body as any;
        try {
            await veiculoService.updateVeiculo(veiculoId, data);
            return reply.status(200).send({ success: true });
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

    app.delete("/:id", async (request: any, reply) => {
        const veiculoId = request.params["id"] as string;
        try {
            await veiculoService.deleteVeiculo(veiculoId);
            return reply.status(200).send({ success: true });
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

    app.get("/:id", async (request: any, reply) => {
        const veiculoId = request.params["id"] as string;
        try {
            const veiculo = await veiculoService.getVeiculo(veiculoId);
            return reply.status(200).send(veiculo);
        } catch (err: any) {
            return reply.status(404).send({ error: err.message });
        }
    });

    app.get("/usuario/:usuarioId", async (request: any, reply) => {
        const usuarioId = request.params["usuarioId"] as string;
        const filtros = request.query;
        try {
            const veiculos = await veiculoService.listVeiculos(usuarioId, filtros);
            return reply.status(200).send(veiculos);
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

    app.get("/usuario/:usuarioId/com-contagem", async (request: any, reply) => {
        const usuarioId = request.params["usuarioId"] as string;
        try {
            const veiculos = await veiculoService.listVeiculosComContagemAtivos(usuarioId);
            return reply.status(200).send(veiculos);
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

    app.get("/usuario/:usuarioId/contagem", async (request: any, reply) => {
        const usuarioId = request.params["usuarioId"] as string;
        try {
            const count = await veiculoService.countListVeiculosByUsuario(usuarioId);
            return reply.status(200).send({ count });
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

    app.patch("/:id/toggle-ativo", async (request: any, reply) => {
        const veiculoId = request.params["id"] as string;
        const { novoStatus } = request.body as { novoStatus: boolean };
        try {
            await veiculoService.toggleAtivo(veiculoId, novoStatus);
            return reply.status(200).send({ ativo: novoStatus });
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });
};

export default veiculoRoute;
