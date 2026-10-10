import { z } from "zod";
import { StatusRepasseEnum, ModoCobrancaEnum } from "../types/enums.js";

export const listAdminRepassesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  data_inicio: z.string().optional(),
  data_fim: z.string().optional(),
  status: z.union([z.nativeEnum(StatusRepasseEnum), z.literal("TODOS")]).optional(),
  motorista_id: z.string().uuid().optional(),
  search: z.string().optional(),
});

export type ListAdminRepassesQuery = z.infer<typeof listAdminRepassesQuerySchema>;

export const adminMotoristaFinanceiroUpdateSchema = z.object({
  chave_pix_repasse: z.string().max(255).optional().nullable(),
  tipo_chave_pix: z.string().max(50).optional().nullable(),
  modo_cobranca: z.nativeEnum(ModoCobrancaEnum).optional(),
  taxa_personalizada: z.number().min(0).max(100).optional().nullable(),
  enviar_recibo_automatico: z.boolean().optional(),
});

export type AdminMotoristaFinanceiroUpdateInput = z.infer<typeof adminMotoristaFinanceiroUpdateSchema>;
