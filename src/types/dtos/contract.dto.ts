import { z } from 'zod';

export const createContractSchema = z.object({
  passageiroId: z.string().uuid('ID do passageiro inválido'),
  provider: z.enum(['inhouse', 'assinafy']).default('inhouse'),
});

export type CreateContractDTO = z.infer<typeof createContractSchema>;

export const signContractSchema = z.object({
  assinatura: z.string().min(1, 'Assinatura é obrigatória'),
  metadados: z.object({
    ip: z.string(),
    userAgent: z.string(),
    timestamp: z.string(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
  }),
});

export type SignContractDTO = z.infer<typeof signContractSchema>;

export const listContractsSchema = z.object({
  status: z.enum(['pendente', 'assinado', 'cancelado', 'expirado']).optional(),
  passageiroId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ListContractsDTO = z.infer<typeof listContractsSchema>;
