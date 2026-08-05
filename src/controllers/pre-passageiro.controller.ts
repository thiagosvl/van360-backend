import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prePassageiroService } from "../services/pre-passageiro.service.js";
import { createPrePassageiroSchema } from "../types/dtos/pre-passageiro.dto.js";

export const prePassageiroController = {
  async listByUsuario(request: FastifyRequest, reply: FastifyReply) {
    const { usuarioId } = request.params as { usuarioId: string };
    const { search } = request.query as { search?: string };
    const reqAny = request as any;
    const targetOwnerId = reqAny.data_owner_id || usuarioId;

    try {
      const prePassageiros = await prePassageiroService.listPrePassageiros(targetOwnerId, search);
      return reply.status(200).send(prePassageiros);
    } catch (err: unknown) {
      throw err;
    }
  },

  async create(request: FastifyRequest, reply: FastifyReply) {
    try {
      const data = createPrePassageiroSchema.parse(request.body);
      const prePassageiro = await prePassageiroService.createPrePassageiro(data);
      return reply.status(201).send(prePassageiro);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: "Dados inválidos.", details: err.issues });
      }
      throw err;
    }
  },

  async delete(request: FastifyRequest, reply: FastifyReply) {
    const { id: prePassageiroId } = request.params as { id: string };
    try {
      await prePassageiroService.deletePrePassageiro(prePassageiroId);
      return reply.status(200).send({ success: true });
    } catch (err: unknown) {
      throw err;
    }
  }
};
