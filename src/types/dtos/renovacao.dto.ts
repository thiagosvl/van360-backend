import { z } from "zod";
import { RenovacaoMotivoRecusa, RenovacaoQuemRecusou, RenovacaoReajusteTipo, RenovacaoStatus } from "../enums.js";
import { moneyToNumber } from "../../utils/currency.utils.js";
import { parseLocalDate } from "../../utils/date.utils.js";

const optionalString = z.union([z.string(), z.null(), z.undefined()]).transform(v => {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  return v;
});

export const listRenovacoesQuerySchema = z.object({
  ano_destino: z.union([z.number(), z.string().transform(v => Number(v))]).optional().default(2027),
  status: z.nativeEnum(RenovacaoStatus).optional(),
  escola_id: z.string().uuid().optional(),
  periodo: z.string().optional(),
  search: z.string().optional(),
});

export type ListRenovacoesQueryDTO = z.infer<typeof listRenovacoesQuerySchema>;

export const reajusteLoteSchema = z.object({
  ano_destino: z.number().int().default(2027),
  tipo: z.nativeEnum(RenovacaoReajusteTipo),
  valor: z.union([z.number(), z.string().transform(v => moneyToNumber(v))]),
  escola_id: z.string().uuid().optional().nullable(),
  escola_ids: z.array(z.string().uuid()).optional().nullable(),
  data_inicio_transporte: z.union([z.string(), z.null(), z.undefined()]).transform(v => v ? parseLocalDate(v) : undefined).optional(),
  data_fim_transporte: z.union([z.string(), z.null(), z.undefined()]).transform(v => v ? parseLocalDate(v) : undefined).optional(),
  data_inicio_cobranca: z.union([z.string(), z.null(), z.undefined()]).transform(v => v ? parseLocalDate(v) : undefined).optional(),
  data_fim_cobranca: z.union([z.string(), z.null(), z.undefined()]).transform(v => v ? parseLocalDate(v) : undefined).optional(),
});

export type ReajusteLoteDTO = z.infer<typeof reajusteLoteSchema>;

export const updateRenovacaoSchema = z.object({
  ano_destino: z.number().int().default(2027),
  status: z.nativeEnum(RenovacaoStatus).optional(),
  novo_valor_cobranca: z.union([z.number(), z.string().transform(v => moneyToNumber(v)), z.null()]).optional(),
  novo_dia_vencimento: z.union([z.number(), z.string().transform(v => Number(v)), z.null()]).optional(),
  nova_escola_id: z.string().uuid().optional().nullable().or(z.literal("")).transform(v => (!v || v === "none") ? null : v),
  novo_periodo: optionalString,
  nova_modalidade: optionalString,
  nova_turma: optionalString,
  novo_nome_professor: optionalString,
  nova_data_inicio_transporte: z.union([z.string(), z.null(), z.undefined()]).transform(v => v ? parseLocalDate(v) : undefined).optional(),
  nova_data_fim_transporte: z.union([z.string(), z.null(), z.undefined()]).transform(v => v ? parseLocalDate(v) : undefined).optional(),
  nova_data_inicio_cobranca: z.union([z.string(), z.null(), z.undefined()]).transform(v => v ? parseLocalDate(v) : undefined).optional(),
  nova_data_fim_cobranca: z.union([z.string(), z.null(), z.undefined()]).transform(v => v ? parseLocalDate(v) : undefined).optional(),
  novo_veiculo_id: z.string().uuid().optional().nullable().or(z.literal("")).transform(v => (!v || v === "none") ? null : v),
  novo_isento: z.boolean().optional(),
  motivo_recusa: z.nativeEnum(RenovacaoMotivoRecusa).optional().nullable(),
  justificativa_recusa: optionalString,
  quem_recusou: z.nativeEnum(RenovacaoQuemRecusou).optional().nullable(),
  observacoes_pais: optionalString,
});

export type UpdateRenovacaoDTO = z.infer<typeof updateRenovacaoSchema>;

export const virarAnoLetivoSchema = z.object({
  ano_destino: z.number().int().default(2027),
});

export type VirarAnoLetivoDTO = z.infer<typeof virarAnoLetivoSchema>;
