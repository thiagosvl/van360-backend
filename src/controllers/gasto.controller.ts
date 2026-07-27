import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { gastoService } from "../services/gasto.service.js";
import { createGastoSchema, listGastosFiltersSchema, updateGastoSchema } from "../types/dtos/gasto.dto.js";
import { GastoEscopoAcao } from "../types/enums.js";

export const gastoController = {
    async create(request: FastifyRequest, reply: FastifyReply) {
        const data = createGastoSchema.parse(request.body);
        const result = await gastoService.createGasto(data);
        return reply.status(201).send(result);
    },

    async update(request: FastifyRequest, reply: FastifyReply) {
        const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
        const data = updateGastoSchema.parse(request.body);
        await gastoService.updateGasto(id, data, data.escopo);
        return reply.status(200).send({ success: true });
    },

    async delete(request: FastifyRequest, reply: FastifyReply) {
        const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
        const { escopo } = z.object({ escopo: z.nativeEnum(GastoEscopoAcao).optional() }).parse(request.query);
        await gastoService.deleteGasto(id, escopo);
        return reply.status(200).send({ success: true });
    },

    async get(request: FastifyRequest, reply: FastifyReply) {
        const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
        const gasto = await gastoService.getGasto(id);
        return reply.status(200).send(gasto);
    },

    async listByUsuario(request: FastifyRequest, reply: FastifyReply) {
        const { usuarioId } = z.object({ usuarioId: z.string().uuid() }).parse(request.params);
        const filtros = listGastosFiltersSchema.parse(request.query);
        const gastos = await gastoService.listGastos(usuarioId, filtros);
        return reply.status(200).send(gastos);
    }
};
