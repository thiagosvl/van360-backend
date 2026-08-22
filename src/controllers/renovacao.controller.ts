import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { renovacaoService } from "../services/renovacao.service.js";
import { AppError } from "../errors/AppError.js";
import {
  listRenovacoesQuerySchema,
  reajusteLoteSchema,
  updateRenovacaoSchema,
  virarAnoLetivoSchema,
} from "../types/dtos/renovacao.dto.js";

export const renovacaoController = {
  getDashboard: async (request: FastifyRequest, reply: FastifyReply) => {
    const usuarioId = request.data_owner_id || request.user?.id;
    if (!usuarioId) throw new AppError("Usuário não autenticado", 401);

    const query = listRenovacoesQuerySchema.parse(request.query);
    logger.info({ usuarioId, ano: query.ano_destino }, "RenovacaoController.getDashboard - Starting");

    const result = await renovacaoService.getDashboardRenovacao(usuarioId, query);
    return reply.status(200).send(result);
  },

  reajusteLote: async (request: FastifyRequest, reply: FastifyReply) => {
    const usuarioId = request.data_owner_id || request.user?.id;
    if (!usuarioId) throw new AppError("Usuário não autenticado", 401);

    const dto = reajusteLoteSchema.parse(request.body);
    logger.info({ usuarioId, tipo: dto.tipo, valor: dto.valor }, "RenovacaoController.reajusteLote - Starting");

    const result = await renovacaoService.reajusteLote(usuarioId, dto);
    return reply.status(200).send({ success: true, updated_count: result.length });
  },

  updateIndividual: async (request: FastifyRequest, reply: FastifyReply) => {
    const usuarioId = request.data_owner_id || request.user?.id;
    if (!usuarioId) throw new AppError("Usuário não autenticado", 401);

    const { passageiroId } = request.params as { passageiroId: string };
    const dto = updateRenovacaoSchema.parse(request.body);
    logger.info({ usuarioId, passageiroId }, "RenovacaoController.updateIndividual - Starting");

    const result = await renovacaoService.updateRenovacaoIndividual(usuarioId, passageiroId, dto);
    return reply.status(200).send(result);
  },

  virarAno: async (request: FastifyRequest, reply: FastifyReply) => {
    const usuarioId = request.data_owner_id || request.user?.id;
    if (!usuarioId) throw new AppError("Usuário não autenticado", 401);

    const dto = virarAnoLetivoSchema.parse(request.body);
    logger.info({ usuarioId, ano: dto.ano_destino }, "RenovacaoController.virarAno - Starting");

    const result = await renovacaoService.virarAnoLetivo(usuarioId, dto);
    return reply.status(200).send(result);
  },
};
