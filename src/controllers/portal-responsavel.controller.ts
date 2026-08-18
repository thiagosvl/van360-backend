import { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../errors/AppError.js";
import { portalResponsavelService } from "../services/portal-responsavel.service.js";
import { portalResponsavelTrackingService } from "../services/portal-responsavel-tracking.service.js";
import {
  checkPhoneSchema,
  loginResponsavelSchema,
  setupPinSchema
} from "../types/dtos/responsavel.dto.js";
import { createResponsavelAusenciaSchema } from "../types/dtos/responsavel-ausencia.dto.js";
import { registerPushTokenSchema } from "../schemas/notification.schema.js";

function getResponsavelToken(request: FastifyRequest) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AppError("Token de autorização não fornecido.", 401);
  }
  return authHeader.replace("Bearer ", "").trim();
}

export const portalResponsavelController = {
  checkPhone: async (request: FastifyRequest, reply: FastifyReply) => {
    const data = checkPhoneSchema.parse(request.body);
    const result = await portalResponsavelService.checkPhone(data.telefone);
    return reply.status(200).send(result);
  },

  setupPin: async (request: FastifyRequest, reply: FastifyReply) => {
    const data = setupPinSchema.parse(request.body);
    const result = await portalResponsavelService.setupPin(data.telefone, data.pin);
    return reply.status(200).send(result);
  },

  login: async (request: FastifyRequest, reply: FastifyReply) => {
    const data = loginResponsavelSchema.parse(request.body);
    const result = await portalResponsavelService.login(data.telefone, data.pin);
    return reply.status(200).send(result);
  },

  getPassageiros: async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError("Token de autorização não fornecido.", 401);
    }
    const token = authHeader.replace("Bearer ", "").trim();
    const result = await portalResponsavelService.getPassageiros(token);
    return reply.status(200).send(result);
  },

  getPassageiroCarteirinha: async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError("Token de autorização não fornecido.", 401);
    }
    const token = authHeader.replace("Bearer ", "").trim();
    const { id } = request.params as { id: string };

    const result = await portalResponsavelService.getPassageiroCarteirinha(token, id);
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

    const result = await portalResponsavelService.updateDadosComplementares(token, id, cpf, email);
    return reply.status(200).send(result);
  },

  checkResetEmails: async (request: FastifyRequest, reply: FastifyReply) => {
    const { telefone } = request.body as { telefone: string };
    if (!telefone) throw new AppError("Telefone é obrigatório.", 400);

    const result = await portalResponsavelService.checkResetEmails(telefone);
    return reply.status(200).send(result);
  },

  sendResetOtp: async (request: FastifyRequest, reply: FastifyReply) => {
    const { telefone, emailIndex } = request.body as { telefone: string; emailIndex?: number };
    if (!telefone) throw new AppError("Telefone é obrigatório.", 400);

    const result = await portalResponsavelService.sendResetOtp(telefone, emailIndex ?? 0);
    return reply.status(200).send(result);
  },

  validateResetOtp: async (request: FastifyRequest, reply: FastifyReply) => {
    const { telefone, codigo } = request.body as { telefone: string; codigo: string };
    if (!telefone || !codigo) throw new AppError("Telefone e código são obrigatórios.", 400);

    const result = await portalResponsavelService.validateResetOtp(telefone, codigo);
    return reply.status(200).send(result);
  },

  executePinReset: async (request: FastifyRequest, reply: FastifyReply) => {
    const { resetToken, newPin } = request.body as { resetToken: string; newPin: string };
    if (!resetToken || !newPin) throw new AppError("Token e novo PIN são obrigatórios.", 400);

    const result = await portalResponsavelService.executePinReset(resetToken, newPin);
    return reply.status(200).send(result);
  },

  resetPinByDriver: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { responsavelId } = request.query as { responsavelId?: string };

    const result = await portalResponsavelService.resetPinByDriver(id, responsavelId);
    return reply.status(200).send(result);
  },

  registrarAusencia: async (request: FastifyRequest, reply: FastifyReply) => {
    const token = getResponsavelToken(request);
    const { id } = request.params as { id: string };
    const bodyParsed = createResponsavelAusenciaSchema.parse(request.body);

    const result = await portalResponsavelService.registrarAusencia(token, id, bodyParsed);
    return reply.status(201).send(result);
  },

  removerAusencia: async (request: FastifyRequest, reply: FastifyReply) => {
    const token = getResponsavelToken(request);
    const { id, ausenciaId } = request.params as { id: string; ausenciaId: string };

    const result = await portalResponsavelService.removerAusencia(token, id, ausenciaId);
    return reply.status(200).send(result);
  },

  updateObservacoes: async (request: FastifyRequest, reply: FastifyReply) => {
    const token = getResponsavelToken(request);
    const { id } = request.params as { id: string };
    const { observacoes } = request.body as { observacoes: string };

    const result = await portalResponsavelService.updateObservacoes(token, id, observacoes || "");
    return reply.status(200).send(result);
  },

  addResponsavel: async (request: FastifyRequest, reply: FastifyReply) => {
    const token = getResponsavelToken(request);
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    const result = await portalResponsavelService.addResponsavel(token, id, body);
    return reply.status(201).send(result);
  },

  updateResponsavel: async (request: FastifyRequest, reply: FastifyReply) => {
    const token = getResponsavelToken(request);
    const { id, responsavelId } = request.params as { id: string; responsavelId: string };
    const body = request.body as Record<string, unknown>;

    const result = await portalResponsavelService.updateResponsavel(token, id, responsavelId, body);
    return reply.status(200).send(result);
  },

  deleteResponsavel: async (request: FastifyRequest, reply: FastifyReply) => {
    const token = getResponsavelToken(request);
    const { id, responsavelId } = request.params as { id: string; responsavelId: string };

    const result = await portalResponsavelService.deleteResponsavel(token, id, responsavelId);
    return reply.status(200).send(result);
  },

  setPrincipalResponsavel: async (request: FastifyRequest, reply: FastifyReply) => {
    const token = getResponsavelToken(request);
    const { id, responsavelId } = request.params as { id: string; responsavelId: string };

    const result = await portalResponsavelService.setPrincipalResponsavel(token, id, responsavelId);
    return reply.status(200).send(result);
  },

  registerPushToken: async (request: FastifyRequest, reply: FastifyReply) => {
    const token = getResponsavelToken(request);
    const payload = await portalResponsavelService.verifyResponsavelToken(token);
    const body = registerPushTokenSchema.parse(request.body);

    const result = await portalResponsavelService.registerPushToken(payload.phone, body.token, body.platform);
    return reply.status(200).send(result);
  },

  getRastreamentoPassageiro: async (request: FastifyRequest, reply: FastifyReply) => {
    const token = getResponsavelToken(request);
    const { id } = request.params as { id: string };

    const result = await portalResponsavelTrackingService.getRastreamentoPassageiro(token, id);
    return reply.status(200).send(result);
  }
};
