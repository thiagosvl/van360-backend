import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prePassageiroService } from "../services/pre-passageiro.service.js";
import { createPrePassageiroSchema } from "../types/dtos/pre-passageiro.dto.js";
import { extractClientAccessData } from "../utils/request-client.utils.js";

export const prePassageiroController = {
  async listByUsuario(request: FastifyRequest, reply: FastifyReply) {
    const { usuarioId } = request.params as { usuarioId: string };
    const { search } = request.query as { search?: string };
    const targetOwnerId = request.data_owner_id || usuarioId;

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
      const clientAccess = extractClientAccessData(
        request,
        data.metadados_cadastro as Record<string, unknown> | undefined,
        data.dispositivo_cadastro
      );

      const prePassageiro = await prePassageiroService.createPrePassageiro({
        ...data,
        dispositivo_cadastro: clientAccess.dispositivoCadastro,
        metadados_cadastro: clientAccess.metadados,
      });
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
