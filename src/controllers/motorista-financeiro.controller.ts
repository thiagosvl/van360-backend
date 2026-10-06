import { FastifyReply, FastifyRequest } from "fastify";
import { updateMotoristaFinanceiroSchema } from "../schemas/motorista-financeiro.schema.js";
import { motoristaFinanceiroService } from "../services/motorista-financeiro.service.js";

interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    id: string;
  };
}

export const MotoristaFinanceiroController = {
  async obterConfiguracoes(request: FastifyRequest, reply: FastifyReply) {
    const usuarioId = (request as AuthenticatedRequest).user?.id;
    if (!usuarioId) {
      return reply.status(401).send({ error: "Usuário não autenticado." });
    }

    const config = await motoristaFinanceiroService.obterConfiguracoes(usuarioId);
    return reply.status(200).send(config);
  },

  async atualizarConfiguracoes(request: FastifyRequest, reply: FastifyReply) {
    const usuarioId = (request as AuthenticatedRequest).user?.id;
    if (!usuarioId) {
      return reply.status(401).send({ error: "Usuário não autenticado." });
    }

    const parsed = updateMotoristaFinanceiroSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Dados inválidos.",
        details: parsed.error.format()
      });
    }

    const updated = await motoristaFinanceiroService.atualizarConfiguracoes(usuarioId, parsed.data);
    return reply.status(200).send(updated);
  }
};
