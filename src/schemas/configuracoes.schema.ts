import { z } from "zod";
import { RastreamentoModo } from "../types/enums.js";

export const updateConfiguracoesSchema = z.object({
  notificar_pais_cobrancas: z.boolean().optional(),
  notificar_motorista_parcelas: z.boolean().optional(),
  notificar_motorista_aniversarios: z.boolean().optional(),
  notificar_inicio_rota: z.boolean().optional(),
  notificar_proxima_parada: z.boolean().optional(),
  notificar_conclusao_parada: z.boolean().optional(),
  rastreamento_ativo: z.boolean().optional(),
  rastreamento_modo: z.nativeEnum(RastreamentoModo).optional(),
});

export type UpdateConfiguracoesInput = z.infer<typeof updateConfiguracoesSchema>;

