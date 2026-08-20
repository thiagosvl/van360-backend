import { z } from "zod";
import { RastreamentoModo } from "../types/enums.js";

export const updateConfiguracoesSchema = z.object({
  notificar_pais_cobrancas: z.boolean().optional(),
  cobranca_aviso_previo_ativo: z.boolean().optional(),
  cobranca_dias_aviso_previo: z.number().int().min(1).max(5).nullable().optional(),
  cobranca_vencimento_hoje_ativo: z.boolean().optional(),
  cobranca_atraso_3_dias_ativo: z.boolean().optional(),
  cobranca_atraso_5_dias_ativo: z.boolean().optional(),
  cobranca_atraso_7_dias_ativo: z.boolean().optional(),
  notificar_motorista_parcelas: z.boolean().optional(),
  notificar_motorista_aniversarios: z.boolean().optional(),
  notificar_inicio_rota: z.boolean().optional(),
  notificar_proxima_parada: z.boolean().optional(),
  notificar_conclusao_parada: z.boolean().optional(),
  rastreamento_ativo: z.boolean().optional(),
  rastreamento_modo: z.nativeEnum(RastreamentoModo).optional(),
});


export type UpdateConfiguracoesInput = z.infer<typeof updateConfiguracoesSchema>;

