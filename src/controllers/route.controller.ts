import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { AppError } from "../errors/AppError.js";
import { routeService } from "../services/route.service.js";

import {
  createRouteSchema,
  updateRouteSchema,
  stepRouteExecutionSchema,
  reorderExecucaoSchema,
  createAusenciaSchema
} from "../types/dtos/route.dto.js";

export const routeController = {
  create: async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info("RouteController.create - Starting");
    const data = createRouteSchema.parse(request.body);
    const result = await routeService.createRoute(data);
    return reply.status(201).send(result);
  },

  update: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    logger.info({ routeId: id }, "RouteController.update - Starting");
    const data = updateRouteSchema.parse(request.body);
    const result = await routeService.updateRoute(id, data);
    return reply.status(200).send(result);
  },

  delete: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    logger.info({ routeId: id }, "RouteController.delete - Starting");
    await routeService.deleteRoute(id);
    return reply.status(200).send({ success: true });
  },

  get: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    logger.info({ routeId: id }, "RouteController.get - Starting");
    const route = await routeService.getRoute(id);
    return reply.status(200).send(route);
  },

  listByUsuario: async (request: FastifyRequest, reply: FastifyReply) => {
    const { usuarioId } = request.params as { usuarioId: string };
    logger.info({ usuarioId }, "RouteController.listByUsuario");
    const routes = await routeService.listRoutesByUsuario(usuarioId);
    return reply.status(200).send(routes);
  },

  listExecucoesByUsuario: async (request: FastifyRequest, reply: FastifyReply) => {
    const { usuarioId } = request.params as { usuarioId: string };
    logger.info({ usuarioId }, "RouteController.listExecucoesByUsuario");
    const execs = await routeService.listExecucoesByUsuario(usuarioId);
    return reply.status(200).send(execs);
  },

  getExecucaoDetail: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    logger.info({ execucaoId: id }, "RouteController.getExecucaoDetail - Starting");
    const exec = await routeService.getExecucaoDetail(id);
    return reply.status(200).send(exec);
  },

  iniciarRota: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    logger.info({ routeId: id }, "RouteController.iniciarRota - Starting");

    const authUid = (request as any).user?.id;
    if (!authUid) {
      throw new AppError("Não autorizado", 401);
    }

    const result = await routeService.iniciarRota(id, authUid);
    return reply.status(201).send(result);
  },

  atualizarParadaStatus: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { parada_id, status } = request.body as { parada_id: string; status: any };
    logger.info({ execucaoId: id, parada_id, status }, "RouteController.atualizarParadaStatus");
    const result = await routeService.atualizarParadaStatus(id, parada_id, status);
    return reply.status(200).send(result);
  },

  reordenarExecucao: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const data = reorderExecucaoSchema.parse(request.body);
    const result = await routeService.reordenarExecucao(id, data);
    return reply.status(200).send(result);
  },

  cancelarExecucao: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    logger.info({ execucaoId: id }, "RouteController.cancelarExecucao - Starting");
    const result = await routeService.cancelarExecucao(id);
    return reply.status(200).send(result);
  },

  finalizarExecucao: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    logger.info({ execucaoId: id }, "RouteController.finalizarExecucao");
    const result = await routeService.finalizarExecucao(id);
    return reply.status(200).send(result);
  },

  createAusencia: async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info("RouteController.createAusencia - Starting");
    const data = createAusenciaSchema.parse(request.body);
    const authUid = (request as any).user?.id;
    const result = await routeService.registrarAusenciaAntecipada({
      ...data,
      registrado_por: authUid
    });
    return reply.status(201).send(result);
  },

  deleteAusencia: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { passageiro_id, rota_id, data_ausencia } = (request.query || {}) as { passageiro_id?: string; rota_id?: string; data_ausencia?: string };
    logger.info({ ausenciaId: id, passageiro_id, rota_id }, "RouteController.deleteAusencia - Starting");
    await routeService.removerAusenciaAntecipada(id, passageiro_id, rota_id, data_ausencia);
    return reply.status(200).send({ success: true });
  },

  listAusencias: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { data } = request.query as { data?: string };
    logger.info({ rotaId: id, data }, "RouteController.listAusencias");
    const ausencias = await routeService.listAusenciasByRota(id, data);
    return reply.status(200).send(ausencias);
  },

  listAusenciasByPassageiro: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    logger.info({ passageiroId: id }, "RouteController.listAusenciasByPassageiro");
    const ausencias = await routeService.listAusenciasByPassageiro(id);
    return reply.status(200).send(ausencias);
  },

  listRotasByPassageiro: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    logger.info({ passageiroId: id }, "RouteController.listRotasByPassageiro");
    const rotas = await routeService.listRotasByPassageiro(id);
    return reply.status(200).send(rotas);
  }
};
