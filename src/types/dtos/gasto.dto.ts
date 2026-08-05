import { z } from "zod";
import { moneyToNumber } from "../../utils/currency.utils.js";
import { GastoTipoCalculoParcela, GastoEscopoAcao } from "../enums.js";

// === Schemas ===

export const createGastoSchema = z.object({
  usuario_id: z.string().uuid(),
  veiculo_id: z.string().uuid().optional().nullable(),
  valor: z.union([z.number(), z.string()])
    .transform(v => typeof v === 'string' ? moneyToNumber(v) : v)
    .refine(v => typeof v === 'number' && !isNaN(v) && v >= 0, "Valor do gasto não pode ser negativo"),
  data: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)), // ISO or YYYY-MM-DD
  categoria: z.string().min(2).max(50),
  descricao: z.string().optional(),
  parcelado: z.boolean().optional(),
  parcelas: z.number().int().min(2).max(36).optional(),
  tipo_calculo_parcela: z.nativeEnum(GastoTipoCalculoParcela).optional(),
});

export const updateGastoSchema = createGastoSchema.partial().omit({ usuario_id: true }).extend({
  escopo: z.nativeEnum(GastoEscopoAcao).optional(),
}); // Usuario não muda

export const listGastosFiltersSchema = z.object({
  veiculo_id: z.string().optional(), // Aceita UUID ou 'unspecified'
  categoria: z.string().optional(),
  data_inicio: z.string().optional(),
  data_fim: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().min(0).optional()
});

// === Types ===
export type CreateGastoDTO = z.infer<typeof createGastoSchema>;
export type UpdateGastoDTO = z.infer<typeof updateGastoSchema>;
export type ListGastosFiltersDTO = z.infer<typeof listGastosFiltersSchema>;
