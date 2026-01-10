import { z } from "zod";

const optionalString = z.string().optional().or(z.literal("")).transform(v => v === "" ? undefined : v);
const optionalNumber = z.union([z.number(), z.string().length(0).transform(() => undefined), z.string().min(1).transform(val => Number(val))]).optional();

export const createVeiculoSchema = z.object({
    usuario_id: z.string().uuid(),
    placa: z.string().min(1, "Placa é obrigatória"),
    marca: optionalString,
    modelo: optionalString,
    ano: optionalNumber,
    capacidade: optionalNumber,
    ativo: z.boolean().optional()
});

export type CreateVeiculoDTO = z.infer<typeof createVeiculoSchema>;

export const updateVeiculoSchema = createVeiculoSchema.partial();
export type UpdateVeiculoDTO = z.infer<typeof updateVeiculoSchema>;

export const listVeiculosFiltersSchema = z.object({
    search: z.string().optional(),
    placa: z.string().optional(),
    marca: z.string().optional(),
    modelo: z.string().optional(),
    ativo: z.string().optional(), // 'true' | 'false' vem da query string
    includeId: z.string().optional()
});

export type ListVeiculosFiltersDTO = z.infer<typeof listVeiculosFiltersSchema>;

export const toggleVeiculoAtivoSchema = z.object({
    novoStatus: z.boolean()
});

export type ToggleVeiculoAtivoDTO = z.infer<typeof toggleVeiculoAtivoSchema>;

export interface Veiculo {
    id: string;
    usuario_id: string;
    placa: string;
    marca: string | null;
    modelo: string | null;
    ano: number | null;
    capacidade: number | null;
    ativo: boolean;
    created_at: string;
    updated_at: string;
}

export interface VeiculoComContagem extends Veiculo {
    passageiros_ativos_count: number;
}
