import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { escolaService } from "../services/escola.service.js";
import {
    createEscolaSchema,
    listEscolasFiltersSchema,
    toggleEscolaAtivoSchema,
    updateEscolaSchema
} from "../types/dtos/escola.dto.js";

import { AppError } from "../errors/AppError.js";


export const escolaController = {
  create: async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info("EscolaController.create - Starting");
    try {
        const data = createEscolaSchema.parse(request.body);
        if (request.data_owner_id) {
            data.usuario_id = request.data_owner_id;
        }

        const result = await escolaService.createEscola(data);
        return reply.status(201).send(result);
    } catch (error: unknown) {
        const err = error as { code?: string };
        if (err.code === '23505') {
            throw new AppError("Já existe uma escola cadastrada com este nome.", 409);
        }
        throw error;
    }
  },

  update: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    logger.info({ escolaId: id }, "EscolaController.update - Starting");

    try {
        const data = updateEscolaSchema.parse(request.body);
        await escolaService.updateEscola(id, data);
        return reply.status(200).send({ success: true });
    } catch (error: unknown) {
        const err = error as { code?: string };
        if (err.code === '23505') {
            throw new AppError("Já existe uma escola cadastrada com este nome.", 409);
        }
        throw error;
    }
  },

  delete: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    logger.info({ escolaId: id }, "EscolaController.delete - Starting");

    await escolaService.deleteEscola(id);
    return reply.status(200).send({ success: true });
  },

  get: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const escola = await escolaService.getEscola(id);
    return reply.status(200).send(escola);
  },

  listByUsuario: async (request: FastifyRequest, reply: FastifyReply) => {
    const { usuarioId } = request.params as { usuarioId: string };
    const targetOwnerId = request.data_owner_id || usuarioId;
    const filtros = listEscolasFiltersSchema.parse(request.query);
    const escolas = await escolaService.listEscolas(targetOwnerId, filtros);
    return reply.status(200).send(escolas);
  },

  listWithContagem: async (request: FastifyRequest, reply: FastifyReply) => {
    const { usuarioId } = request.params as { usuarioId: string };
    const targetOwnerId = request.data_owner_id || usuarioId;
    const filtros = listEscolasFiltersSchema.parse(request.query);
    const escolas = await escolaService.listEscolasComContagemAtivos(targetOwnerId, filtros);
    return reply.status(200).send(escolas);
  },

  countByUsuario: async (request: FastifyRequest, reply: FastifyReply) => {
    const { usuarioId } = request.params as { usuarioId: string };
    const targetOwnerId = request.data_owner_id || usuarioId;
    const count = await escolaService.countListEscolasByUsuario(targetOwnerId);
    return reply.status(200).send({ count });
  },

  toggleAtivo: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { novoStatus } = toggleEscolaAtivoSchema.parse(request.body);
    await escolaService.toggleAtivo(id, novoStatus);
    return reply.status(200).send({ ativo: novoStatus });
  }
};
