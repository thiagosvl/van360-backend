import { FastifyRequest, FastifyReply } from 'fastify';
import { contractService } from '../services/contract.service.js';
import { createContractSchema, signContractSchema, listContractsSchema } from '../types/dtos/contract.dto.js';
import { logger } from '../config/logger.js';

export const contractController = {
  create: async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = createContractSchema.parse(req.body);
      const usuarioId = (req.user as any).id;
      
      const contrato = await contractService.criarContrato(usuarioId, data.passageiroId, data.provider);
      
      return reply.status(201).send(contrato);
    } catch (error: any) {
      logger.error({ error }, 'Erro ao criar contrato');
      return reply.status(400).send({ error: error.message });
    }
  },

  list: async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const filters = listContractsSchema.parse(req.query);
      const usuarioId = (req.user as any).id;
      
      const result = await contractService.listarContratos(usuarioId, filters);
      
      return reply.status(200).send(result);
    } catch (error: any) {
      logger.error({ error }, 'Erro ao listar contratos');
      return reply.status(400).send({ error: error.message });
    }
  },

  getByToken: async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { token } = req.params as { token: string };
      
      const contrato = await contractService.consultarContrato(token);
      
      return reply.status(200).send(contrato);
    } catch (error: any) {
      logger.error({ error }, 'Erro ao consultar contrato');
      return reply.status(404).send({ error: 'Contrato nao encontrado' });
    }
  },

  sign: async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { token } = req.params as { token: string };
      const data = signContractSchema.parse(req.body);
      
      const result = await contractService.processarAssinatura(token, data.assinatura, data.metadados);
      
      return reply.status(200).send(result);
    } catch (error: any) {
      logger.error({ error }, 'Erro ao assinar contrato');
      return reply.status(400).send({ error: error.message });
    }
  },

  cancel: async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = req.params as { id: string };
      const usuarioId = (req.user as any).id;
      
      const result = await contractService.cancelarContrato(id, usuarioId);
      
      return reply.status(200).send(result);
    } catch (error: any) {
      logger.error({ error }, 'Erro ao cancelar contrato');
      return reply.status(400).send({ error: error.message });
    }
  },

  download: async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = req.params as { id: string };
      const usuarioId = (req.user as any).id;
      
      const pdfBuffer = await contractService.baixarContrato(id, usuarioId);
      
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `attachment; filename="contrato-${id}.pdf"`);
      
      return reply.send(pdfBuffer);
    } catch (error: any) {
      logger.error({ error }, 'Erro ao baixar contrato');
      return reply.status(400).send({ error: error.message });
    }
  },
};
