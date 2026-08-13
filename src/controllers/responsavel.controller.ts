import { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../errors/AppError.js";
import { responsavelService } from "../services/responsavel.service.js";
import {
  checkPhoneSchema,
  loginResponsavelSchema,
  setupPinSchema
} from "../types/dtos/responsavel.dto.js";

export const responsavelController = {
  checkPhone: async (request: FastifyRequest, reply: FastifyReply) => {
    const data = checkPhoneSchema.parse(request.body);
    const result = await responsavelService.checkPhone(data.telefone);
    return reply.status(200).send(result);
  },

  setupPin: async (request: FastifyRequest, reply: FastifyReply) => {
    const data = setupPinSchema.parse(request.body);
    const result = await responsavelService.setupPin(data.telefone, data.pin);
    return reply.status(200).send(result);
  },

  login: async (request: FastifyRequest, reply: FastifyReply) => {
    const data = loginResponsavelSchema.parse(request.body);
    const result = await responsavelService.login(data.telefone, data.pin);
    return reply.status(200).send(result);
  },

  getPassageiroCarteirinha: async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError("Token de autorização não fornecido.", 401);
    }
    const token = authHeader.replace("Bearer ", "").trim();
    const { id } = request.params as { id: string };

    const result = await responsavelService.getPassageiroCarteirinha(token, id);
    return reply.status(200).send(result);
  },

  resetPinByDriver: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { responsavelId } = request.query as { responsavelId?: string };

    const result = await responsavelService.resetPinByDriver(id, responsavelId);
    return reply.status(200).send(result);
  }
};
