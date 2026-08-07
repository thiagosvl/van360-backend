import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { motoristaEquipeService } from "../services/motorista-equipe.service.js";
import { UserType } from "../types/enums.js";
import { AppError } from "../errors/AppError.js";
import {
  createMembroEquipeSchema,
  updateMembroEquipeSchema,
  redefinirSenhaMembroSchema
} from "../types/dtos/motorista-equipe.dto.js";

export const motoristaEquipeController = {
  list: async (request: FastifyRequest, reply: FastifyReply) => {
    const gestorId = request.data_owner_id;
    const assignedVeiculoId = request.assigned_veiculo_id;

    const querySchema = z.object({
      veiculo_id: z.string().optional(),
    });

    const { veiculo_id } = querySchema.parse(request.query);
    const effectiveVeiculoId = assignedVeiculoId || veiculo_id;

    if (!gestorId) {
      throw new AppError("Não autorizado", 401);
    }

    const membros = await motoristaEquipeService.listMembros(gestorId, effectiveVeiculoId);

    return reply.send({ membros });
  },

  create: async (request: FastifyRequest, reply: FastifyReply) => {
    const gestorId = request.data_owner_id;
    const callerTipo = request.profile?.tipo as UserType | undefined;
    const assignedVeiculoId = request.assigned_veiculo_id;

    if (!gestorId) {
      throw new AppError("Não autorizado", 401);
    }

    let body = createMembroEquipeSchema.parse(request.body);

    if (callerTipo === UserType.MOTORISTA_AUXILIAR) {
      if (!assignedVeiculoId) {
        throw new AppError("Motorista auxiliar sem veículo atribuído", 400);
      }
      body = {
        ...body,
        tipo: UserType.MONITOR,
        veiculo_id: assignedVeiculoId,
      };
    }

    const membro = await motoristaEquipeService.createMembro(gestorId, body);

    return reply.status(201).send(membro);
  },

  update: async (request: FastifyRequest, reply: FastifyReply) => {
    const gestorId = request.data_owner_id;
    const callerTipo = request.profile?.tipo as UserType | undefined;
    const assignedVeiculoId = request.assigned_veiculo_id;

    if (!gestorId) {
      throw new AppError("Não autorizado", 401);
    }

    const paramsSchema = z.object({ id: z.string().uuid() });
    const { id } = paramsSchema.parse(request.params);

    let body = updateMembroEquipeSchema.parse(request.body);

    if (callerTipo === UserType.MOTORISTA_AUXILIAR) {
      body = {
        ...body,
        tipo: UserType.MONITOR,
        veiculo_id: assignedVeiculoId || undefined,
      };
    }

    const membro = await motoristaEquipeService.updateMembro(id, gestorId, body);

    return reply.send(membro);
  },

  redefinirSenha: async (request: FastifyRequest, reply: FastifyReply) => {
    const gestorId = request.data_owner_id;
    if (!gestorId) throw new AppError("Não autorizado", 401);

    const paramsSchema = z.object({ id: z.string().uuid() });
    const { id } = paramsSchema.parse(request.params);

    const { nova_senha } = redefinirSenhaMembroSchema.parse(request.body);
    const result = await motoristaEquipeService.redefinirSenha(id, gestorId, nova_senha);

    return reply.send(result);
  },

  desativar: async (request: FastifyRequest, reply: FastifyReply) => {
    const gestorId = request.data_owner_id;
    if (!gestorId) throw new AppError("Não autorizado", 401);

    const paramsSchema = z.object({ id: z.string().uuid() });
    const { id } = paramsSchema.parse(request.params);

    const membro = await motoristaEquipeService.desativarMembro(id, gestorId);

    return reply.send(membro);
  },

  delete: async (request: FastifyRequest, reply: FastifyReply) => {
    const gestorId = request.data_owner_id;
    if (!gestorId) throw new AppError("Não autorizado", 401);

    const paramsSchema = z.object({ id: z.string().uuid() });
    const { id } = paramsSchema.parse(request.params);

    const result = await motoristaEquipeService.deleteMembro(id, gestorId);

    return reply.send(result);
  }
};
