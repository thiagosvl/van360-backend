import { z } from "zod";

export const updateConfiguracoesSchema = z.object({
  notificar_pais_cobrancas: z.boolean().optional(),
  notificar_motorista_parcelas: z.boolean().optional(),
  notificar_motorista_aniversarios: z.boolean().optional(),
});

export type UpdateConfiguracoesInput = z.infer<typeof updateConfiguracoesSchema>;
