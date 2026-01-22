import { z } from "zod";
import { moneyToNumber } from "../../utils/currency.utils.js";

export enum CategoriaGasto {
  COMBUSTIVEL = "combustivel",
  MANUTENCAO = "manutencao",
  IMPOSTO = "imposto",
  ALIMENTACAO = "alimentacao",
  OUTROS = "outros"
}

// === Schemas ===

export const createGastoSchema = z.object({
  usuario_id: z.string().uuid(),
  veiculo_id: z.string().uuid().optional().nullable(),
  valor: z.union([z.number(), z.string()]).transform(v => typeof v === 'string' ? moneyToNumber(v) : v),
  data: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)), // ISO or YYYY-MM-DD
  categoria: z.nativeEnum(CategoriaGasto).or(z.string()),
  descricao: z.string().optional(),
  km_atual: z.number().int().positive().optional(),
  litros: z.number().positive().optional(),
  local: z.string().optional()
});

export const updateGastoSchema = createGastoSchema.partial().omit({ usuario_id: true }); // Usuario não muda

export const listGastosFiltersSchema = z.object({
  veiculo_id: z.string().uuid().optional(),
  categoria: z.string().optional(),
  data_inicio: z.string().optional(),
  data_fim: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().min(0).optional()
});

// === Types ===
export type CreateGastoDTO = z.infer<typeof createGastoSchema>;
export type UpdateGastoDTO = z.infer<typeof updateGastoSchema>;
export type ListGastosFiltersDTO = z.infer<typeof listGastosFiltersSchema>;
