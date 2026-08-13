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

  getPassageiros: async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError("Token de autorização não fornecido.", 401);
    }
    const token = authHeader.replace("Bearer ", "").trim();
    const result = await responsavelService.getPassageiros(token);
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

  updateDadosComplementares: async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError("Token de autorização não fornecido.", 401);
    }
    const token = authHeader.replace("Bearer ", "").trim();
    const { id } = request.params as { id: string };
    const { cpf, email } = request.body as { cpf: string; email: string };

    if (!cpf || !email) {
      throw new AppError("CPF e E-mail são obrigatórios.", 400);
    }

    const result = await responsavelService.updateDadosComplementares(token, id, cpf, email);
    return reply.status(200).send(result);
  },

  checkResetEmails: async (request: FastifyRequest, reply: FastifyReply) => {
    const { telefone } = request.body as { telefone: string };
    if (!telefone) throw new AppError("Telefone é obrigatório.", 400);

    const result = await responsavelService.checkResetEmails(telefone);
    return reply.status(200).send(result);
  },

  sendResetOtp: async (request: FastifyRequest, reply: FastifyReply) => {
    const { telefone, emailIndex } = request.body as { telefone: string; emailIndex?: number };
    if (!telefone) throw new AppError("Telefone é obrigatório.", 400);

    const result = await responsavelService.sendResetOtp(telefone, emailIndex ?? 0);
    return reply.status(200).send(result);
  },

  validateResetOtp: async (request: FastifyRequest, reply: FastifyReply) => {
    const { telefone, codigo } = request.body as { telefone: string; codigo: string };
    if (!telefone || !codigo) throw new AppError("Telefone e código são obrigatórios.", 400);

    const result = await responsavelService.validateResetOtp(telefone, codigo);
    return reply.status(200).send(result);
  },

  executePinReset: async (request: FastifyRequest, reply: FastifyReply) => {
    const { resetToken, newPin } = request.body as { resetToken: string; newPin: string };
    if (!resetToken || !newPin) throw new AppError("Token e novo PIN são obrigatórios.", 400);

    const result = await responsavelService.executePinReset(resetToken, newPin);
    return reply.status(200).send(result);
  },

  resetPinByDriver: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { responsavelId } = request.query as { responsavelId?: string };

    const result = await responsavelService.resetPinByDriver(id, responsavelId);
    return reply.status(200).send(result);
  }
};
