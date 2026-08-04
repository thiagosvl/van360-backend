import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { updateConfiguracoesSchema } from "../schemas/configuracoes.schema.js";
import {
  atualizarConfiguracoesUsuario,
  obterConfiguracoesUsuario,
} from "../services/configuracoes.service.js";

interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    id: string;
  };
}

export const ConfiguracoesController = {
  async obterConfiguracoes(request: FastifyRequest, reply: FastifyReply) {
    const usuarioId = (request as AuthenticatedRequest).user?.id;

    if (!usuarioId) {
      return reply.status(401).send({ error: "Usuário não autenticado." });
    }

    try {
      const configuracoes = await obterConfiguracoesUsuario(usuarioId);
      return reply.status(200).send(configuracoes);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro interno ao buscar configurações.";
      logger.error({ error: message, usuarioId }, "Falha ao buscar configurações do usuário.");
      return reply.status(500).send({ error: message });
    }
  },

  async atualizarConfiguracoes(request: FastifyRequest, reply: FastifyReply) {
    const usuarioId = (request as AuthenticatedRequest).user?.id;

    if (!usuarioId) {
      return reply.status(401).send({ error: "Usuário não autenticado." });
    }

    const parseResult = updateConfiguracoesSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Dados de configuração inválidos.",
        details: parseResult.error.flatten(),
      });
    }

    try {
      const configuracoesAtualizadas = await atualizarConfiguracoesUsuario(
        usuarioId,
        parseResult.data
      );
      return reply.status(200).send(configuracoesAtualizadas);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro interno ao atualizar configurações.";
      logger.error({ error: message, usuarioId }, "Falha ao atualizar configurações do usuário.");
      return reply.status(500).send({ error: message });
    }
  },
};
