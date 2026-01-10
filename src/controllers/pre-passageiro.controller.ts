import { FastifyReply, FastifyRequest } from "fastify";
import { prePassageiroService } from "../services/pre-passageiro.service.js";

export const prePassageiroController = {
  async listByUsuario(request: FastifyRequest, reply: FastifyReply) {
    const usuarioId = (request.params as any).usuarioId as string;
    const { search } = request.query as any;

    try {
      const prePassageiros = await prePassageiroService.listPrePassageiros(usuarioId, search);
      return reply.status(200).send(prePassageiros);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  },

  async create(request: FastifyRequest, reply: FastifyReply) {
    const data = request.body as any;
    try {
      const prePassageiro = await prePassageiroService.createPrePassageiro(data);
      return reply.status(201).send(prePassageiro);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  },

  async delete(request: FastifyRequest, reply: FastifyReply) {
    const prePassageiroId = (request.params as any).id as string;
    try {
      await prePassageiroService.deletePrePassageiro(prePassageiroId);
      return reply.status(200).send({ success: true });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  }
};
