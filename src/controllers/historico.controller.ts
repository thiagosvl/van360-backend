import { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../errors/AppError.js";
import { historicoService } from "../services/historico.service.js";
import { AtividadeEntidadeTipo } from "../types/enums.js";

export const historicoController = {
  listByEntidade: async (request: FastifyRequest, reply: FastifyReply) => {
    const { entidadeTipo, entidadeId } = request.params as { entidadeTipo: string; entidadeId: string };
    
    // Validar se o tipo de entidade é válido
    if (!Object.values(AtividadeEntidadeTipo).includes(entidadeTipo as any)) {
      throw new AppError("Tipo de entidade inválido", 400);
    }

    const atividades = await historicoService.listByEntidade(entidadeTipo as any, entidadeId);
    return reply.status(200).send(atividades);
  },

  listByUsuario: async (request: FastifyRequest, reply: FastifyReply) => {
    const { usuarioId } = request.params as { usuarioId: string };
    const atividades = await historicoService.listByUsuario(usuarioId);
    return reply.status(200).send(atividades);
  }
};
