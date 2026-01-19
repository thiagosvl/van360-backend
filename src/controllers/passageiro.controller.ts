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
    updatePassageiroSchema
} from "../types/dtos/passageiro.dto.js";
// Assuming AppError is defined or imported elsewhere, as it's used in the provided snippet.
// import { AppError } from "../utils/appError.js"; // Example import if needed

export const passageiroController = {
  create: async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info("PassageiroController.create - Starting");
    const data = createPassageiroSchema.parse(request.body);
    const result = await passageiroService.createPassageiro(data);
    return reply.status(201).send(result);
  },

  update: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    logger.info({ passageiroId: id }, "PassageiroController.update - Starting");
    const data = updatePassageiroSchema.parse(request.body);
    
    // Tratamento especial para enviar_cobranca_automatica
    if (data.enviar_cobranca_automatica === true) {
        try {
            await passageiroService.updatePassageiro(id, data);
        } catch (err: any) {
            // Interceptar erro de limite para retornar 403 ou 422 específico se quiser
            // Mas o global handler já trata Error normal com 500 ou AppError.
            // Se o service lançar Error, vai 500. Se quisermos 400, precisamos converter.
            if (err.message.includes("LIMIT_EXCEEDED")) {
                // Assuming AppError is available in scope
                throw new AppError(err.message, 403);
            }
            throw err;
        }
    } else {
        await passageiroService.updatePassageiro(id, data);
    }
    
    return reply.status(200).send({ success: true });
  },

  delete: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    logger.info({ passageiroId: id }, "PassageiroController.delete - Starting");
    await passageiroService.deletePassageiro(id);
    return reply.status(200).send({ success: true });
  },

  get: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const passageiro = await passageiroService.getPassageiro(id);
    return reply.status(200).send(passageiro);
  },

  listByUsuario: async (request: FastifyRequest, reply: FastifyReply) => {
    const { usuarioId } = request.params as { usuarioId: string };
    const filtros = listPassageirosFiltersSchema.parse(request.query);
    logger.info({ usuarioId, filtros }, "PassageiroController.listByUsuario");
    const passageiros = await passageiroService.listPassageiros(usuarioId, filtros);
    return reply.status(200).send(passageiros);
  },

  toggleAtivo: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { novoStatus } = toggleAtivoSchema.parse(request.body);
    
    try {
        await passageiroService.toggleAtivo(id, novoStatus);
        return reply.status(200).send({ ativo: novoStatus });
    } catch (err: any) {
         if (err.message.includes("LIMIT_EXCEEDED")) {
            // Assuming AppError is available in scope
            throw new AppError(err.message, 403);
         }
         throw err;
    }
  },

  countCobrancas: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const count = await cobrancaService.countByPassageiro(id);
    return reply.status(200).send({ numeroCobrancas: count });
  },

  countByUsuario: async (request: FastifyRequest, reply: FastifyReply) => {
    const { usuarioId } = request.params as { usuarioId: string };
    const filtros: any = request.query || {}; 
    const count = await passageiroService.countListPassageirosByUsuario(usuarioId, filtros as any);
    return reply.status(200).send({ count });
  },

  finalizePreCadastro: async (request: FastifyRequest, reply: FastifyReply) => {
    const { prePassageiroId } = request.params as { prePassageiroId: string };
    const { data, usuarioId } = finalizePreCadastroSchema.parse(request.body);
    const result = await passageiroService.finalizePreCadastro(prePassageiroId, data, usuarioId);
    return reply.status(200).send(result);
  }
};
