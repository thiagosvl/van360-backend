import { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../errors/AppError.js";
import { historicoService } from "../services/historico.service.js";
import { AtividadeAcao, AtividadeEntidadeTipo } from "../types/enums.js";
import { registrarEventoSchema } from "../schemas/telemetria.schema.js";
import { isMotoristaTitular } from "../utils/user.utils.js";

export const historicoController = {
  listByEntidade: async (request: FastifyRequest, reply: FastifyReply) => {
    const { entidadeTipo, entidadeId } = request.params as { entidadeTipo: string; entidadeId: string };

    if (!Object.values(AtividadeEntidadeTipo).includes(entidadeTipo as AtividadeEntidadeTipo)) {
      throw new AppError("Tipo de entidade inválido", 400);
    }

    const atividades = await historicoService.listByEntidade(entidadeTipo as AtividadeEntidadeTipo, entidadeId);
    return reply.status(200).send(atividades);
  },

  listByUsuario: async (request: FastifyRequest, reply: FastifyReply) => {
    const { usuarioId } = request.params as { usuarioId: string };
    const targetOwnerId = request.data_owner_id || usuarioId;
    const atividades = await historicoService.listByUsuario(targetOwnerId);
    return reply.status(200).send(atividades);
  },

  registrarEvento: async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = registrarEventoSchema.parse(request.body);

    if (payload.acao === AtividadeAcao.APP_ABERTO) {
      if (!isMotoristaTitular(request.profile)) {
        return reply.status(204).send();
      }
    }

    const userId = request.data_owner_id || request.user?.id;
    if (!userId) {
      throw new AppError("Usuário não autenticado", 401);
    }

    await historicoService.registrarEventoTelemetria(userId, payload);
    return reply.status(204).send();
  }
};
