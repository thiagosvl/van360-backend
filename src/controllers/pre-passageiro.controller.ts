import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prePassageiroService } from "../services/pre-passageiro.service.js";
import { createPrePassageiroSchema } from "../types/dtos/pre-passageiro.dto.js";

export const prePassageiroController = {
  async listByUsuario(request: FastifyRequest<{ Params: { usuarioId: string }, Querystring: { search?: string } }>, reply: FastifyReply) {
    const { usuarioId } = request.params;
    const { search } = request.query;

    try {
      const prePassageiros = await prePassageiroService.listPrePassageiros(usuarioId, search);
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

  async delete(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const prePassageiroId = request.params.id;
    try {
      await prePassageiroService.deletePrePassageiro(prePassageiroId);
      return reply.status(200).send({ success: true });
    } catch (err: unknown) {
      throw err;
    }
  }
};
