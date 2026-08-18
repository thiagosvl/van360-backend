import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { AppError } from "../errors/AppError.js";
import { cobrancaService } from "../services/cobranca.service.js";
import { passageiroService } from "../services/passageiro.service.js";
import {
    createPassageiroSchema,
    finalizePreCadastroSchema,
    listPassageirosFiltersSchema,
    toggleAtivoSchema,
    updatePassageiroSchema,
    getAniversariantesQuerySchema,
    createResponsavelAdicionalSchema,
    updateResponsavelAdicionalSchema
} from "../types/dtos/passageiro.dto.js";



export const passageiroController = {
  create: async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info("PassageiroController.create - Starting");
    const data = createPassageiroSchema.parse(request.body);
    if (request.data_owner_id) {
      data.usuario_id = request.data_owner_id;
    }

    const result = await passageiroService.createPassageiro(data);
    return reply.status(201).send(result);
  },

  update: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const targetOwnerId = request.data_owner_id || request.user?.id;
    const assignedVeiculoId = request.assigned_veiculo_id || undefined;
    logger.info({ passageiroId: id }, "PassageiroController.update - Starting");

    const data = updatePassageiroSchema.parse(request.body);
    
    await passageiroService.updatePassageiro(id, data, targetOwnerId, assignedVeiculoId);
    
    return reply.status(200).send({ success: true });
  },

  delete: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const targetOwnerId = request.data_owner_id || request.user?.id;
    const assignedVeiculoId = request.assigned_veiculo_id || undefined;
    logger.info({ passageiroId: id }, "PassageiroController.delete - Starting");

    await passageiroService.deletePassageiro(id, targetOwnerId, assignedVeiculoId);
    return reply.status(200).send({ success: true });
  },

  get: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const targetOwnerId = request.data_owner_id || request.user?.id;
    const assignedVeiculoId = request.assigned_veiculo_id || undefined;
    const passageiro = await passageiroService.getPassageiro(id, targetOwnerId, assignedVeiculoId);
    return reply.status(200).send(passageiro);
  },

  listByUsuario: async (request: FastifyRequest, reply: FastifyReply) => {
    const { usuarioId } = request.params as { usuarioId: string };
    const filtros = listPassageirosFiltersSchema.parse(request.query);

    const targetOwnerId = request.data_owner_id || usuarioId;
    if (request.assigned_veiculo_id) {
      filtros.veiculo = request.assigned_veiculo_id;
    }

    logger.info({ usuarioId, targetOwnerId, filtros }, "PassageiroController.listByUsuario");
    const passageiros = await passageiroService.listPassageiros(targetOwnerId, filtros);
    return reply.status(200).send(passageiros);
  },

  toggleAtivo: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { novoStatus } = toggleAtivoSchema.parse(request.body);
    const targetOwnerId = request.data_owner_id || request.user?.id;
    const assignedVeiculoId = request.assigned_veiculo_id || undefined;
    
    try {
        await passageiroService.toggleAtivo(id, novoStatus, targetOwnerId, assignedVeiculoId);
        return reply.status(200).send({ ativo: novoStatus });
    } catch (err: unknown) {
         const error = err as Error;
         if (error.message.includes("LIMIT_EXCEEDED")) {
            throw new AppError(error.message, 403);
         }
         throw err;
    }
  },



  finalizePreCadastro: async (request: FastifyRequest, reply: FastifyReply) => {
    const { prePassageiroId } = request.params as { prePassageiroId: string };
    const { data, usuarioId } = finalizePreCadastroSchema.parse(request.body);
    const result = await passageiroService.finalizePreCadastro(prePassageiroId, data, usuarioId);
    return reply.status(200).send(result);
  },

  lookupResponsavel: async (request: FastifyRequest, reply: FastifyReply) => {
    const { cpf, telefone, term } = request.query as { cpf?: string; telefone?: string; term?: string };
    const authUid = request.user?.id;

    if (!authUid) {
        throw new AppError("Não autorizado", 401);
    }
    
    const targetOwnerId = request.data_owner_id || authUid;
    const searchTerm = cpf || telefone || term || "";
    const data = await passageiroService.lookupResponsavelByCpf(targetOwnerId, searchTerm);

    return reply.status(200).send(data); 
  },

  getAniversariantesDoMes: async (request: FastifyRequest, reply: FastifyReply) => {
    const targetOwnerId = request.data_owner_id || request.user?.id;
    const assignedVeiculoId = request.assigned_veiculo_id;

    if (!targetOwnerId) throw new AppError("Não autorizado", 401);

    const { mes } = getAniversariantesQuerySchema.parse(request.query);

    const data = await passageiroService.listarAniversariantesDoMes(targetOwnerId, mes, assignedVeiculoId || undefined);
    
    return reply.status(200).send(data);
  },

  addResponsavelAdicional: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id: passageiroId } = request.params as { id: string };
    const data = createResponsavelAdicionalSchema.parse(request.body);
    const result = await passageiroService.addResponsavelAdicional(passageiroId, data);
    return reply.status(201).send(result);
  },

  updateResponsavelAdicional: async (request: FastifyRequest, reply: FastifyReply) => {
    const { responsavelId } = request.params as { responsavelId: string };
    const data = updateResponsavelAdicionalSchema.parse(request.body);
    const result = await passageiroService.updateResponsavelAdicional(responsavelId, data, data.passageiroId || undefined);
    return reply.status(200).send(result);
  },

  deleteResponsavelAdicional: async (request: FastifyRequest, reply: FastifyReply) => {
    const { responsavelId } = request.params as { responsavelId: string };
    const { passageiroId } = request.query as { passageiroId?: string };
    const result = await passageiroService.deleteResponsavelAdicional(responsavelId, passageiroId);
    return reply.status(200).send(result);
  },

  setPrincipalResponsavel: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id: passageiroId, responsavelId } = request.params as { id: string; responsavelId: string };
    const result = await passageiroService.setPrincipalResponsavel(passageiroId, responsavelId);
    return reply.status(200).send(result);
  }
};
