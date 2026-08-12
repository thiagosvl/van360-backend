import { z } from "zod";
import { moneyToNumber } from "../../utils/currency.utils.js";
import { CobrancaOrigem, CobrancaTipoPagamento } from "../enums.js";

export const createCobrancaSchema = z.object({
    usuario_id: z.string().uuid(),
    passageiro_id: z.string().uuid().optional(),
    valor: z.union([z.number(), z.string()])
      .transform(v => typeof v === 'string' ? moneyToNumber(v) : v)
      .refine(v => typeof v === 'number' && !isNaN(v) && v > 0, "Valor da cobrança deve ser maior que zero"),
    data_vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD"),

    mes: z.union([z.number(), z.string()]).transform(v => Number(v)).optional(),
    ano: z.union([z.number(), z.string()]).transform(v => Number(v)).optional(),

    status: z.string().optional(),
    origem: z.nativeEnum(CobrancaOrigem).optional(),
    parcelas: z.number().int().positive("Número de parcelas deve ser maior que zero").optional(),
    qtd_parcelas: z.number().int().positive("Número de parcelas deve ser maior que zero").optional(),

    pagamento_manual: z.boolean().optional(),
    tipo_pagamento: z.nativeEnum(CobrancaTipoPagamento).nullable().optional(),
    data_pagamento: z.string().nullable().optional(),
    valor_pago: z.union([z.number(), z.string()]).transform(v => typeof v === 'string' ? moneyToNumber(v) : v).optional(),
    recibo_url: z.string().nullable().optional(),
    desativar_lembretes: z.boolean().optional(),
    enviar_recibo_whatsapp: z.boolean().optional(),
});

export type CreateCobrancaDTO = z.infer<typeof createCobrancaSchema>;

export const updateCobrancaSchema = z.union([
    z.object({
        data: createCobrancaSchema.partial(),
        cobrancaOriginal: z.record(z.string(), z.any()).optional()
    }),
    createCobrancaSchema.partial().transform(parsed => ({
        data: parsed,
        cobrancaOriginal: undefined as Record<string, any> | undefined
    }))
]);

export type UpdateCobrancaDTO = z.infer<typeof updateCobrancaSchema>;

export const listCobrancasFiltersSchema = z.object({
    usuarioId: z.string().optional(),
    passageiroId: z.string().optional(),
    status: z.string().optional(),
    dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato inválido").optional(),
    dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato inválido").optional(),
    search: z.string().optional(),
    veiculoId: z.string().optional(),
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
export const registrarPagamentoManualSchema = z.object({
    valor_pago: z.union([z.number(), z.string()]).transform(v => typeof v === 'string' ? moneyToNumber(v) : v).optional(),
    data_pagamento: z.string().optional(),
    tipo_pagamento: z.nativeEnum(CobrancaTipoPagamento).optional(),
    enviar_recibo_whatsapp: z.boolean().optional().default(true),
});

export type RegistrarPagamentoManualDTO = z.infer<typeof registrarPagamentoManualSchema>;
