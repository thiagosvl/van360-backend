import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { updateConfiguracoesSchema, FINANCIAL_CONFIGURACAO_KEYS } from "../schemas/configuracoes.schema.js";
import {
  atualizarConfiguracoesUsuario,
  obterConfiguracoesUsuario,
} from "../services/configuracoes.service.js";
import { hasPermission, PERMISSIONS } from "../config/permissions.js";
import { UserType } from "../types/enums.js";

interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    id: string;
    app_metadata?: {
      role?: string;
    };
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
      const userRole = (request.user?.app_metadata?.role || request.profile?.tipo || UserType.MOTORISTA) as UserType;
      const canViewFinancials = hasPermission(userRole, PERMISSIONS.FINANCEIRO_VISUALIZAR);

      if (!canViewFinancials) {
        configuracoes.chave_pix = null;
        configuracoes.tipo_chave_pix = null;
      }

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

    const userRole = (request.user?.app_metadata?.role || request.profile?.tipo || UserType.MOTORISTA) as UserType;
    const hasCobrancasPerm = hasPermission(userRole, PERMISSIONS.COBRANCAS_GERENCIAR);

    const isUpdatingFinancial = FINANCIAL_CONFIGURACAO_KEYS.some((k) => parseResult.data[k] !== undefined);
    if (isUpdatingFinancial && !hasCobrancasPerm) {
      return reply.status(403).send({
        error: "Acesso negado",
        code: "PERMISSION_DENIED",
        message: "Você não possui permissão para alterar configurações de cobrança.",
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
