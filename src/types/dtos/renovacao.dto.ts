import { z } from "zod";
import type { Tables } from "../database.types.js";
import { RenovacaoReajusteTipo, RenovacaoStatus } from "../enums.js";
import { moneyToNumber } from "../../utils/currency.utils.js";
import { parseLocalDate } from "../../utils/date.utils.js";

export type PassageiroEntity = Tables<"passageiros">;
export type PassageiroRenovacaoEntity = Tables<"passageiro_renovacoes">;
export type ResponsavelEntity = Tables<"responsaveis">;
export type EscolaEntity = Tables<"escolas">;
export type VeiculoEntity = Tables<"veiculos">;
export type UsuarioEntity = Tables<"usuarios">;

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
  tipo: z.nativeEnum(RenovacaoReajusteTipo).optional(),
  tipo_reajuste: z.nativeEnum(RenovacaoReajusteTipo).optional(),
  valor: z.union([z.number(), z.string().transform(v => moneyToNumber(v))]).optional(),
  valor_reajuste: z.union([z.number(), z.string().transform(v => moneyToNumber(v))]).optional(),
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
});

export type UpdateRenovacaoDTO = z.infer<typeof updateRenovacaoSchema>;

export const virarAnoLetivoSchema = z.object({
  ano_destino: z.number().int().default(2027),
});

export type VirarAnoLetivoDTO = z.infer<typeof virarAnoLetivoSchema>;

export const responderRenovacaoPublicaSchema = z.object({
  status: z.enum(["confirmado", "recusado"]),
  observacoes_pais: z.string().optional().nullable(),
});

export type ResponderRenovacaoPublicaDTO = z.infer<typeof responderRenovacaoPublicaSchema>;

export const atualizarDadosPublicosSchema = z.object({
  nome_responsavel: optionalString,
  cpf_responsavel: optionalString,
  telefone_responsavel: optionalString,
  email_responsavel: optionalString,
  parentesco_responsavel: optionalString,
  cep: optionalString,
  logradouro: optionalString,
  numero: optionalString,
  bairro: optionalString,
  cidade: optionalString,
  estado: optionalString,
  complemento: optionalString,
  referencia: optionalString,
  turma: optionalString,
  sala: optionalString,
  nome_professor: optionalString,
  observacoes: optionalString,
  observacoes_pais: optionalString,
});

export type AtualizarDadosPublicosDTO = z.infer<typeof atualizarDadosPublicosSchema>;

export const notificarRenovacaoSchema = z.object({
  ano_destino: z.number().int().default(2027),
});

export type NotificarRenovacaoDTO = z.infer<typeof notificarRenovacaoSchema>;

export const notificarRenovacaoLoteSchema = z.object({
  ano_destino: z.number().int().default(2027),
  passageiro_ids: z.array(z.string().uuid()).optional(),
});

export type NotificarRenovacaoLoteDTO = z.infer<typeof notificarRenovacaoLoteSchema>;

export const atualizarStatusLoteSchema = z.object({
  ano_destino: z.number().int().default(2027),
  passageiro_ids: z.array(z.string().uuid()).min(1),
  status: z.nativeEnum(RenovacaoStatus),
});

export type AtualizarStatusLoteDTO = z.infer<typeof atualizarStatusLoteSchema>;


