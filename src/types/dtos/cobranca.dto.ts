import { z } from "zod";
import { moneyToNumber } from "../../utils/currency.utils.js";
import { CobrancaOrigem, CobrancaTipo } from "../enums.js"; // Added CobrancaOrigem

export const createCobrancaSchema = z.object({
    usuario_id: z.string().uuid(),
    passageiro_id: z.string().uuid().optional(),
    valor: z.union([z.number(), z.string()]).transform(v => typeof v === 'string' ? moneyToNumber(v) : v),
    data_vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD"),
    tipo: z.nativeEnum(CobrancaTipo).optional(),

    mes: z.union([z.number(), z.string()]).transform(v => Number(v)).optional(),
    ano: z.union([z.number(), z.string()]).transform(v => Number(v)).optional(),
    
    status: z.string().optional(),
    origem: z.nativeEnum(CobrancaOrigem).optional(), // Changed from z.string().optional() to z.nativeEnum(CobrancaOrigem).optional()
    
    pagamento_manual: z.boolean().optional(),
    tipo_pagamento: z.string().nullable().optional(),
    data_pagamento: z.string().nullable().optional(),
    valor_pago: z.union([z.number(), z.string()]).transform(v => typeof v === 'string' ? moneyToNumber(v) : v).optional(),
    recibo_url: z.string().nullable().optional(),

    cpf: z.string().optional(),
    nome: z.string().optional(),
    
    gerarPixAsync: z.boolean().optional(),
    enviar_notificacao_agora: z.boolean().optional()
});

export type CreateCobrancaDTO = z.infer<typeof createCobrancaSchema>;

export const updateCobrancaSchema = z.object({
    data: createCobrancaSchema.partial(),
    cobrancaOriginal: z.any().optional()
});

export type UpdateCobrancaDTO = z.infer<typeof updateCobrancaSchema>;

export const listCobrancasFiltersSchema = z.object({
    usuarioId: z.string().uuid(),
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
