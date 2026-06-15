import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { AppError } from "../errors/AppError.js";
import { routeService } from "../services/route.service.js";

import {
  createRouteSchema,
  updateRouteSchema,
  stepRouteExecutionSchema
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

    const authUid = (request as any).user?.id;
    if (authUid) {
      // access control handled by middleware
    }

    const data = updateRouteSchema.parse(request.body);
    const result = await routeService.updateRoute(id, data);
    return reply.status(200).send(result);
  },

  delete: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    logger.info({ routeId: id }, "RouteController.delete - Starting");

    const authUid = (request as any).user?.id;
    if (authUid) {
      // access control handled by middleware
    }

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
    logger.info({ execucaoId: id }, "RouteController.atualizarParadaStatus - Starting");

    const authUid = (request as any).user?.id;
    if (authUid) {
      // access control handled by middleware
    }

    const { passageiro_id, status } = stepRouteExecutionSchema.parse(request.body);
    const result = await routeService.atualizarParadaStatus(id, passageiro_id, status);
    return reply.status(200).send(result);
  },

  cancelarExecucao: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    logger.info({ execucaoId: id }, "RouteController.cancelarExecucao - Starting");

    const authUid = (request as any).user?.id;
    if (authUid) {
      // access control handled by middleware
    }

    const result = await routeService.cancelarExecucao(id);
    return reply.status(200).send(result);
  }
};
