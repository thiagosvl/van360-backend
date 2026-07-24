import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../../config/logger.js";
import { adminUserService } from "../../services/admin/admin-user.service.js";
import {
  updateUserAdminSchema,
  updateSubscriptionAdminSchema,
  listUsersQuerySchema,
  createUserAdminSchema,
} from "../../schemas/admin.schema.js";

export const adminUserController = {
  async getDashboard(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const stats = await adminUserService.getDashboardStats();
      return reply.status(200).send(stats);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error({ error: error.message }, "[AdminUserController] Erro no dashboard.");
      return reply.status(500).send({ error: "Erro ao buscar estatísticas." });
    }
  },

  async getUsers(request: FastifyRequest, reply: FastifyReply) {
    try {
      const query = listUsersQuerySchema.parse(request.query);
      const result = await adminUserService.listUsers(query);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error({ error: error.message }, "[AdminUserController] Erro ao listar usuários.");
      return reply.status(500).send({ error: "Erro ao buscar usuários." });
    }
  },

  async getUserDetails(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const result = await adminUserService.getUserDetails(id);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error({ error: error.message }, "[AdminUserController] Erro ao buscar detalhes.");
      const status = error.message?.includes("não encontrado") ? 404 : 500;
      return reply.status(status).send({ error: error.message });
    }
  },

  async updateUser(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const body = updateUserAdminSchema.parse(request.body);
      const result = await adminUserService.updateUser(id, body);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error({ error: error.message }, "[AdminUserController] Erro ao atualizar usuário.");
      return reply.status(400).send({ error: error.message });
    }
  },

  async updateSubscription(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const body = updateSubscriptionAdminSchema.parse(request.body);
      const result = await adminUserService.updateSubscription(id, body);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error({ error: error.message }, "[AdminUserController] Erro ao atualizar assinatura.");
      return reply.status(400).send({ error: error.message });
    }
  },

  async createUser(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = createUserAdminSchema.parse(request.body);
      const result = await adminUserService.createUser(body);
      return reply.status(201).send(result);
    } catch (err: unknown) {
      const error = err as Error & { field?: string };
      logger.error({ error: error.message }, "[AdminUserController] Erro ao criar usuário.");
      if (error.field) {
        return reply.status(400).send({ error: error.message, field: error.field });
      }
      return reply.status(400).send({ error: error.message });
    }
  },

  async resetUserPassword(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const result = await adminUserService.resetUserPassword(id);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error({ error: error.message }, "[AdminUserController] Erro ao resetar senha.");
      return reply.status(400).send({ error: error.message });
    }
  },

  async deleteUser(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const result = await adminUserService.deleteUser(id);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error({ error: error.message }, "[AdminUserController] Erro ao deletar usuário.");
      return reply.status(400).send({ error: error.message });
    }
  },
};
