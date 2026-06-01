import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { adminService } from "../services/admin.service.js";
import {
  updateUserAdminSchema,
  updateSubscriptionAdminSchema,
  updateConfigSchema,
  listUsersQuerySchema,
  updatePlanSchema,
  createUserAdminSchema,
  listUserLogsQuerySchema,
} from "../schemas/admin.schema.js";

export const AdminController = {

  async getDashboard(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const stats = await adminService.getDashboardStats();
      return reply.status(200).send(stats);
    } catch (err: any) {
      logger.error({ error: err.message }, "[AdminController] Erro no dashboard.");
      return reply.status(500).send({ error: "Erro ao buscar estatísticas." });
    }
  },

  async getUsers(request: FastifyRequest, reply: FastifyReply) {
    try {
      const query = listUsersQuerySchema.parse(request.query);
      const result = await adminService.listUsers(query);
      return reply.status(200).send(result);
    } catch (err: any) {
      logger.error({ error: err.message }, "[AdminController] Erro ao listar usuários.");
      return reply.status(500).send({ error: "Erro ao buscar usuários." });
    }
  },

  async getUserDetails(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const result = await adminService.getUserDetails(id);
      return reply.status(200).send(result);
    } catch (err: any) {
      logger.error({ error: err.message }, "[AdminController] Erro ao buscar detalhes.");
      const status = err.message?.includes("não encontrado") ? 404 : 500;
      return reply.status(status).send({ error: err.message });
    }
  },

  async updateUser(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const body = updateUserAdminSchema.parse(request.body);
      const result = await adminService.updateUser(id, body);
      return reply.status(200).send(result);
    } catch (err: any) {
      logger.error({ error: err.message }, "[AdminController] Erro ao atualizar usuário.");
      return reply.status(400).send({ error: err.message });
    }
  },

  async updateSubscription(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const body = updateSubscriptionAdminSchema.parse(request.body);
      const result = await adminService.updateSubscription(id, body);
      return reply.status(200).send(result);
    } catch (err: any) {
      logger.error({ error: err.message }, "[AdminController] Erro ao atualizar assinatura.");
      return reply.status(400).send({ error: err.message });
    }
  },

  async getConfigs(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const configs = await adminService.listConfigs();
      return reply.status(200).send(configs);
    } catch (err: any) {
      logger.error({ error: err.message }, "[AdminController] Erro ao listar configs.");
      return reply.status(500).send({ error: "Erro ao buscar configurações." });
    }
  },

  async updateConfig(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = updateConfigSchema.parse(request.body);
      const result = await adminService.updateConfig(body.chave, body.valor);
      return reply.status(200).send(result);
    } catch (err: any) {
      logger.error({ error: err.message }, "[AdminController] Erro ao atualizar config.");
      return reply.status(400).send({ error: err.message });
    }
  },

  async getPlans(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const plans = await adminService.listPlans();
      return reply.status(200).send(plans);
    } catch (err: any) {
      logger.error({ error: err.message }, "[AdminController] Erro ao listar planos.");
      return reply.status(500).send({ error: "Erro ao buscar planos." });
    }
  },

  async updatePlan(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const body = updatePlanSchema.parse(request.body);
      const result = await adminService.updatePlan(id, body);
      return reply.status(200).send(result);
    } catch (err: any) {
      logger.error({ error: err.message }, "[AdminController] Erro ao atualizar plano.");
      return reply.status(400).send({ error: err.message });
    }
  },

  async createUser(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = createUserAdminSchema.parse(request.body);
      const result = await adminService.createUser(body);
      return reply.status(201).send(result);
    } catch (err: any) {
      logger.error({ error: err.message }, "[AdminController] Erro ao criar usuário.");
      if (err.field) {
        return reply.status(400).send({ error: err.message, field: err.field });
      }
      return reply.status(400).send({ error: err.message });
    }
  },

  async resetUserPassword(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const result = await adminService.resetUserPassword(id);
      return reply.status(200).send(result);
    } catch (err: any) {
      logger.error({ error: err.message }, "[AdminController] Erro ao resetar senha.");
      return reply.status(400).send({ error: err.message });
    }
  },

  async getUserLogs(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const query = listUserLogsQuerySchema.parse(request.query);
      const result = await adminService.getUserLogs(id, query);
      return reply.status(200).send(result);
    } catch (err: any) {
      logger.error({ error: err.message, id }, "[AdminController] Erro ao buscar logs de atividades.");
      return reply.status(500).send({ error: "Erro ao buscar logs de atividades." });
    }
  },
};

