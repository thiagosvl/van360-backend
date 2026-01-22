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
import { accessControlService } from "../services/access-control.service.js";

export const veiculoController = {
  create: async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info("VeiculoController.create - Starting");
    try {
        const data = createVeiculoSchema.parse(request.body);
        
        // Validate Write Access
        await accessControlService.validateWriteAccess(data.usuario_id);

        const result = await veiculoService.createVeiculo(data);
        return reply.status(201).send(result);
    } catch (error: any) {
        if (error.code === '23505') {
            throw new AppError("Já existe um veículo cadastrado com esta placa.", 409);
        }
        throw error;
    }
  },

  update: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    logger.info({ veiculoId: id }, "VeiculoController.update - Starting");
    
    // Permission Check
    const authUid = (request as any).user?.id;
    if (authUid) {
        const usuarioId = await accessControlService.resolveUsuarioId(authUid);
        await accessControlService.validateWriteAccess(usuarioId);
    }

    try {
        const data = updateVeiculoSchema.parse(request.body);
        await veiculoService.updateVeiculo(id, data);
        return reply.status(200).send({ success: true });
    } catch (error: any) {
        if (error.code === '23505') {
            throw new AppError("Já existe um veículo cadastrado com esta placa.", 409);
        }
        throw error;
    }
  },

  delete: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    logger.info({ veiculoId: id }, "VeiculoController.delete - Starting");

    // Permission Check
    const authUid = (request as any).user?.id;
    if (authUid) {
        const usuarioId = await accessControlService.resolveUsuarioId(authUid);
        await accessControlService.validateWriteAccess(usuarioId);
    }

    await veiculoService.deleteVeiculo(id);
    return reply.status(200).send({ success: true });
  },

  get: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const veiculo = await veiculoService.getVeiculo(id);
    return reply.status(200).send(veiculo);
  },

  listByUsuario: async (request: FastifyRequest, reply: FastifyReply) => {
    const { usuarioId } = request.params as { usuarioId: string };
    const filtros = listVeiculosFiltersSchema.parse(request.query);
    const veiculos = await veiculoService.listVeiculos(usuarioId, filtros);
    return reply.status(200).send(veiculos);
  },

  listWithContagem: async (request: FastifyRequest, reply: FastifyReply) => {
    const { usuarioId } = request.params as { usuarioId: string };
    const filtros = listVeiculosFiltersSchema.parse(request.query);
    const veiculos = await veiculoService.listVeiculosComContagemAtivos(usuarioId, filtros);
    return reply.status(200).send(veiculos);
  },

  countByUsuario: async (request: FastifyRequest, reply: FastifyReply) => {
    const { usuarioId } = request.params as { usuarioId: string };
    const count = await veiculoService.countListVeiculosByUsuario(usuarioId);
    return reply.status(200).send({ count });
  },

  toggleAtivo: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { novoStatus } = toggleVeiculoAtivoSchema.parse(request.body);
    await veiculoService.toggleAtivo(id, novoStatus);
    return reply.status(200).send({ ativo: novoStatus });
  }
};
