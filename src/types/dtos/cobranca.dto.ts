import { z } from "zod";
import { moneyToNumber } from "../../utils/currency.utils.js";
import { CobrancaTipo } from "../enums.js";

export const createCobrancaSchema = z.object({
    usuario_id: z.string().uuid(),
    passageiro_id: z.string().uuid().optional(),
    valor: z.union([z.number(), z.string()]).transform(v => typeof v === 'string' ? moneyToNumber(v) : v),
    data_vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD"),
    // descricao: Removido pois não existe na tabela 'cobrancas'
    tipo: z.nativeEnum(CobrancaTipo).optional(),

    // Campos de metadados (usados pelo worker/job e agora no create manual)
    // Aceita string (do form) e converte para number (do banco)
    mes: z.union([z.number(), z.string()]).transform(v => Number(v)).optional(),
    ano: z.union([z.number(), z.string()]).transform(v => Number(v)).optional(),
    
    status: z.string().optional(),
    origem: z.string().optional(),
    
    // Campos opcionais de payload
    cpf: z.string().optional(),
    nome: z.string().optional(),
    
    // Options
    gerarPixAsync: z.boolean().optional()
});

export type CreateCobrancaDTO = z.infer<typeof createCobrancaSchema>;

export const updateCobrancaSchema = z.object({
    data: createCobrancaSchema.partial(),
    cobrancaOriginal: z.any().optional()
});

export type UpdateCobrancaDTO = z.infer<typeof updateCobrancaSchema>;

export const listCobrancasFiltersSchema = z.object({
    passageiroId: z.string().uuid().optional(),
    status: z.string().optional(),
    dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato inválido").optional(),
    dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato inválido").optional(),
    search: z.string().optional(),
    mes: z.union([z.number(), z.string()]).transform(v => Number(v)).optional(),
    ano: z.union([z.number(), z.string()]).transform(v => Number(v)).optional(),
});

export type ListCobrancasFiltersDTO = z.infer<typeof listCobrancasFiltersSchema>;

export const toggleNotificacoesSchema = z.object({
    novoStatus: z.boolean()
});

export type ToggleNotificacoesDTO = z.infer<typeof toggleNotificacoesSchema>;

export const notificacaoPayloadSchema = z.object({
    tipo_origem: z.string(),
    tipo_evento: z.string(),
    canal: z.string(),
}).passthrough();

export type NotificacaoPayloadDTO = z.infer<typeof notificacaoPayloadSchema>;
