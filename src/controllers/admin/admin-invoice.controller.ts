import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../../config/logger.js";
import { listAdminInvoicesQuerySchema } from "../../schemas/admin-invoice.schema.js";
import { adminInvoiceService } from "../../services/admin/admin-invoice.service.js";

export const adminInvoiceController = {
  async listInvoices(request: FastifyRequest, reply: FastifyReply) {
    try {
      const query = listAdminInvoicesQuerySchema.parse(request.query);
      const result = await adminInvoiceService.listInvoices(query);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error({ error: error.message, stack: error.stack }, "[AdminInvoiceController] Erro ao listar faturas.");
      return reply.status(500).send({ error: "Erro ao listar faturas do sistema." });
    }
  },

  async getInvoiceStats(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const stats = await adminInvoiceService.getInvoiceStats();
      return reply.status(200).send(stats);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error({ error: error.message, stack: error.stack }, "[AdminInvoiceController] Erro ao buscar métricas de faturas.");
      return reply.status(500).send({ error: "Erro ao buscar métricas de faturas." });
    }
  },
};
