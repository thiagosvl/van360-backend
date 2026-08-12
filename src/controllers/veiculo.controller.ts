import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { veiculoService } from "../services/veiculo.service.js";
import {
    createVeiculoSchema,
    listVeiculosFiltersSchema,
    toggleVeiculoAtivoSchema,
    updateVeiculoSchema
} from "../types/dtos/veiculo.dto.js";

import { AppError } from "../errors/AppError.js";

export const veiculoController = {
  create: async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info("VeiculoController.create - Starting");
    try {
        const data = createVeiculoSchema.parse(request.body);
        if (request.data_owner_id) {
            data.usuario_id = request.data_owner_id;
        }

        const result = await veiculoService.createVeiculo(data);
        return reply.status(201).send(result);
    } catch (error: unknown) {
        const err = error as { code?: string };
        if (err.code === '23505') {
            throw new AppError("Já existe um veículo cadastrado com esta placa.", 409);
        }
        throw error;
    }
  },

  update: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    logger.info({ veiculoId: id }, "VeiculoController.update - Starting");

    try {
        const data = updateVeiculoSchema.parse(request.body);
        await veiculoService.updateVeiculo(id, data);
        return reply.status(200).send({ success: true });
    } catch (error: unknown) {
        const err = error as { code?: string };
        if (err.code === '23505') {
            throw new AppError("Já existe um veículo cadastrado com esta placa.", 409);
        }
        throw error;
    }
  },

  delete: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    logger.info({ veiculoId: id }, "VeiculoController.delete - Starting");

    await veiculoService.deleteVeiculo(id);
    return reply.status(200).send({ success: true });
  },

  get: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const targetOwnerId = request.data_owner_id || request.user?.id;
    const assignedVeiculoId = request.assigned_veiculo_id || (request.profile?.veiculo_id as string | undefined);
    const veiculo = await veiculoService.getVeiculo(id, targetOwnerId, assignedVeiculoId);
    return reply.status(200).send(veiculo);
  },

  listByUsuario: async (request: FastifyRequest, reply: FastifyReply) => {
    const { usuarioId } = request.params as { usuarioId: string };
    const targetOwnerId = request.data_owner_id || usuarioId;
    const assignedVeiculoId = request.assigned_veiculo_id || (request.profile?.veiculo_id as string | undefined);
    const filtros = listVeiculosFiltersSchema.parse(request.query);

    let veiculos = await veiculoService.listVeiculos(targetOwnerId, filtros);
    if (assignedVeiculoId) {
      veiculos = veiculos.filter((v: { id: string }) => v.id === assignedVeiculoId);
    }
    return reply.status(200).send(veiculos);
  },

  listWithContagem: async (request: FastifyRequest, reply: FastifyReply) => {
    const { usuarioId } = request.params as { usuarioId: string };
    const targetOwnerId = request.data_owner_id || usuarioId;
    const assignedVeiculoId = request.assigned_veiculo_id || (request.profile?.veiculo_id as string | undefined);
    const filtros = listVeiculosFiltersSchema.parse(request.query);

    let veiculos = await veiculoService.listVeiculosComContagemAtivos(targetOwnerId, filtros);
    if (assignedVeiculoId) {
      veiculos = veiculos.filter((v: { id: string }) => v.id === assignedVeiculoId);
    }
    return reply.status(200).send(veiculos);
  },

  countByUsuario: async (request: FastifyRequest, reply: FastifyReply) => {
    const { usuarioId } = request.params as { usuarioId: string };
    const targetOwnerId = request.data_owner_id || usuarioId;
    const assignedVeiculoId = request.assigned_veiculo_id || (request.profile?.veiculo_id as string | undefined);
    if (assignedVeiculoId) {
      return reply.status(200).send({ count: 1 });
    }
    const count = await veiculoService.countListVeiculosByUsuario(targetOwnerId);
    return reply.status(200).send({ count });
  },

  toggleAtivo: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { novoStatus } = toggleVeiculoAtivoSchema.parse(request.body);
    await veiculoService.toggleAtivo(id, novoStatus);
    return reply.status(200).send({ ativo: novoStatus });
  }
};
