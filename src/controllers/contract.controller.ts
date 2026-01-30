import { FastifyReply, FastifyRequest } from 'fastify';
import { contractService } from '../services/contract.service.js';
import { createContractSchema, listContractsSchema, signContractSchema } from '../types/dtos/contract.dto.js';

export const contractController = {
  create: async (req: FastifyRequest, reply: FastifyReply) => {
    const data = createContractSchema.parse(req.body);
    const usuarioId = (req as any).user.id;

    const contrato = await contractService.criarContrato(usuarioId, data);
    return reply.status(201).send(contrato);
  },

  list: async (req: FastifyRequest, reply: FastifyReply) => {
    const filters = listContractsSchema.parse(req.query);
    const usuarioId = (req as any).user.id;

    const result = await contractService.listarContratos(usuarioId, filters);
    return reply.status(200).send(result);
  },

  getByToken: async (req: FastifyRequest, reply: FastifyReply) => {
    const { token } = req.params as { token: string };
    const contrato = await contractService.consultarContrato(token);
    return reply.status(200).send(contrato);
  },

  sign: async (req: FastifyRequest, reply: FastifyReply) => {
    const { token } = req.params as { token: string };
    const data = signContractSchema.parse(req.body);
    
    const result = await contractService.processarAssinatura(token, data.assinatura, data.metadados);
    return reply.status(200).send(result);
  },

  cancel: async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const usuarioId = (req as any).user.id;

    const result = await contractService.cancelarContrato(id, usuarioId);
    return reply.status(200).send(result);
  },

  download: async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const usuarioId = (req as any).user.id;

    const pdfBuffer = await contractService.baixarContrato(id, usuarioId);
    
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="contrato-${id}.pdf"`);
    
    return reply.send(pdfBuffer);
  },
  
  preview: async (req: FastifyRequest, reply: FastifyReply) => {
    const authId = (req as any).user.id;
    const draftConfig = req.body as any; // Allow relaxed typing for now or define a schema
    
    const pdfBuffer = await contractService.gerarPreview(authId, draftConfig);
    
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `inline; filename="preview-contrato.pdf"`);
    
    return reply.send(pdfBuffer);
  },
};
