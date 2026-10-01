import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { renovacaoService } from "../services/renovacao.service.js";
import { AppError } from "../errors/AppError.js";
import {
  listRenovacoesQuerySchema,
  reajusteLoteSchema,
  updateRenovacaoSchema,
  virarAnoLetivoSchema,
  responderRenovacaoPublicaSchema,
  atualizarDadosPublicosSchema,
  notificarRenovacaoSchema,
  notificarRenovacaoLoteSchema,
  atualizarStatusLoteSchema,
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

  atualizarStatusLote: async (request: FastifyRequest, reply: FastifyReply) => {
    const usuarioId = request.data_owner_id || request.user?.id;
    if (!usuarioId) throw new AppError("Usuário não autenticado", 401);

    const dto = atualizarStatusLoteSchema.parse(request.body);
    logger.info({ usuarioId, count: dto.passageiro_ids.length, status: dto.status }, "RenovacaoController.atualizarStatusLote - Starting");

    const result = await renovacaoService.atualizarStatusLote(usuarioId, dto);
    return reply.status(200).send(result);
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

  getPublic: async (request: FastifyRequest, reply: FastifyReply) => {
    const { token } = request.params as { token: string };
    if (!token) throw new AppError("Token obrigatório", 400);

    const result = await renovacaoService.getPublicRenovacao(token);
    return reply.status(200).send(result);
  },

  responderPublic: async (request: FastifyRequest, reply: FastifyReply) => {
    const { token } = request.params as { token: string };
    if (!token) throw new AppError("Token obrigatório", 400);

    const dto = responderRenovacaoPublicaSchema.parse(request.body);
    const result = await renovacaoService.responderPublico(token, dto.status, dto.observacoes_pais);
    return reply.status(200).send(result);
  },

  atualizarDadosPublicos: async (request: FastifyRequest, reply: FastifyReply) => {
    const { token } = request.params as { token: string };
    if (!token) throw new AppError("Token obrigatório", 400);

    const dto = atualizarDadosPublicosSchema.parse(request.body);
    const result = await renovacaoService.atualizarDadosPublicos(token, dto);
    return reply.status(200).send(result);
  },

  notificarIndividual: async (request: FastifyRequest, reply: FastifyReply) => {
    const usuarioId = request.data_owner_id || request.user?.id;
    if (!usuarioId) throw new AppError("Usuário não autenticado", 401);

    const { passageiroId } = request.params as { passageiroId: string };
    const dto = notificarRenovacaoSchema.parse(request.body);

    const result = await renovacaoService.notificarPassageiro(usuarioId, passageiroId, dto.ano_destino);
    return reply.status(200).send(result);
  },

  notificarLote: async (request: FastifyRequest, reply: FastifyReply) => {
    const usuarioId = request.data_owner_id || request.user?.id;
    if (!usuarioId) throw new AppError("Usuário não autenticado", 401);

    const dto = notificarRenovacaoLoteSchema.parse(request.body);
    const result = await renovacaoService.notificarLote(usuarioId, dto.ano_destino, dto.passageiro_ids);
    return reply.status(200).send(result);
  },
};

