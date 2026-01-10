import { z } from "zod";

const optionalString = z.string().optional().or(z.literal("")).transform(v => v === "" ? undefined : v);

export const createEscolaSchema = z.object({
  usuario_id: z.string().uuid(),
  nome: z.string().min(1, "Nome é obrigatório"),
  logradouro: optionalString,
  numero: optionalString,
  bairro: optionalString,
  cidade: optionalString,
  estado: z.string().length(2).optional().or(z.literal("")).transform(v => v === "" ? undefined : v),
  cep: optionalString,
  referencia: optionalString,
  ativo: z.boolean().optional()
});

export type CreateEscolaDTO = z.infer<typeof createEscolaSchema>;

export const updateEscolaSchema = createEscolaSchema.partial();
export type UpdateEscolaDTO = z.infer<typeof updateEscolaSchema>;

export const listEscolasFiltersSchema = z.object({
  search: z.string().optional(),
  nome: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  ativo: z.string().optional(), // 'true' | 'false' query param
  includeId: z.string().optional()
});

export type ListEscolasFiltersDTO = z.infer<typeof listEscolasFiltersSchema>;

export const toggleEscolaAtivoSchema = z.object({
  novoStatus: z.boolean()
});

export type ToggleEscolaAtivoDTO = z.infer<typeof toggleEscolaAtivoSchema>;
