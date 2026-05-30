import { z } from "zod";
import { SubscriptionStatus, ConfigKey } from "../types/enums.js";

export const updateUserAdminSchema = z.object({
  nome: z.string().min(2).max(120).optional(),
  apelido: z.string().max(60).optional().nullable(),
  email: z.string().email().optional(),
  telefone: z.string().min(10).max(15).optional(),
  cpfcnpj: z.string().min(11).max(14).optional(),
  ativo: z.boolean().optional(),
  data_nascimento: z.string().optional().nullable(),
});

export const updateSubscriptionAdminSchema = z.object({
  plano_id: z.string().uuid().optional(),
  status: z.nativeEnum(SubscriptionStatus).optional(),
  data_vencimento: z.string().optional().nullable(),
  trial_ends_at: z.string().optional().nullable(),
});

export const updateConfigSchema = z.object({
  chave: z.string().min(1),
  valor: z.string(),
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.string().optional(),
});

export type UpdateUserAdminDTO = z.infer<typeof updateUserAdminSchema>;
export type UpdateSubscriptionAdminDTO = z.infer<typeof updateSubscriptionAdminSchema>;
export type UpdateConfigDTO = z.infer<typeof updateConfigSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const updatePlanSchema = z.object({
  valor: z.coerce.number().min(0).optional(),
  valor_promocional: z.coerce.number().min(0).nullable().optional(),
});
export type UpdatePlanDTO = z.infer<typeof updatePlanSchema>;

export const createUserAdminSchema = z.object({
  nome: z.string().min(2).max(120),
  email: z.string().email(),
  telefone: z.string().min(10).max(15),
  cpfcnpj: z.string().min(11).max(14),
  data_nascimento: z.string().optional().nullable(),
  senha: z.string().min(6),
});
export type CreateUserAdminDTO = z.infer<typeof createUserAdminSchema>;

