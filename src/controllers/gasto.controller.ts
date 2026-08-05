import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { gastoService } from "../services/gasto.service.js";
import { createGastoSchema, listGastosFiltersSchema, updateGastoSchema } from "../types/dtos/gasto.dto.js";
import { GastoEscopoAcao } from "../types/enums.js";

export const gastoController = {
    async create(request: FastifyRequest, reply: FastifyReply) {
        const data = createGastoSchema.parse(request.body);
        const reqAny = request as any;

        // Se for sub-conta, garante o vínculo correto de empresa e van
        if (reqAny.data_owner_id) {
            data.usuario_id = reqAny.data_owner_id;
        }
        if (reqAny.assigned_veiculo_id && !data.veiculo_id) {
            data.veiculo_id = reqAny.assigned_veiculo_id;
        }

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
        const reqAny = request as any;

        const targetOwnerId = reqAny.data_owner_id || usuarioId;
        if (reqAny.assigned_veiculo_id && !filtros.veiculo_id) {
            filtros.veiculo_id = reqAny.assigned_veiculo_id;
        }

        const gastos = await gastoService.listGastos(targetOwnerId, filtros);
        return reply.status(200).send(gastos);
    }
};
