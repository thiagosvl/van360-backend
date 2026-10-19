import { z } from "zod";
import type { Tables } from "../database.types.js";
import { RenovacaoReajusteTipo, RenovacaoStatus } from "../enums.js";
import { moneyToNumber } from "../../utils/currency.utils.js";
import { parseLocalDate } from "../../utils/date.utils.js";

export type PassageiroEntity = Tables<"passageiros">;
export type PassageiroMatriculaEntity = Tables<"passageiro_matriculas">;
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
  passageiro_ids: z.array(z.string().uuid()).optional().nullable(),
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
  nova_sala: optionalString,
  novo_nome_professor: optionalString,
  nova_data_inicio_transporte: z.union([z.string(), z.null(), z.undefined()]).transform(v => v ? parseLocalDate(v) : undefined).optional(),
  nova_data_fim_transporte: z.union([z.string(), z.null(), z.undefined()]).transform(v => v ? parseLocalDate(v) : undefined).optional(),
  nova_data_inicio_cobranca: z.union([z.string(), z.null(), z.undefined()]).transform(v => v ? parseLocalDate(v) : undefined).optional(),
  nova_data_fim_cobranca: z.union([z.string(), z.null(), z.undefined()]).transform(v => v ? parseLocalDate(v) : undefined).optional(),
  novo_veiculo_id: z.string().uuid().optional().nullable().or(z.literal("")).transform(v => (!v || v === "none") ? null : v),
});

export type UpdateRenovacaoDTO = z.infer<typeof updateRenovacaoSchema>;

export const responderRenovacaoPublicaSchema = z.object({
  status: z.nativeEnum(RenovacaoStatus),
  observacoes_pais: z.string().optional().nullable(),
});

export type ResponderRenovacaoPublicaDTO = z.infer<typeof responderRenovacaoPublicaSchema>;

export const atualizarDadosPublicosSchema = z.object({
  responsavel: z.object({
    nome: optionalString,
    cpf: optionalString,
    telefone: optionalString,
    email: optionalString,
    parentesco: optionalString,
    cep: optionalString,
    logradouro: optionalString,
    numero: optionalString,
    bairro: optionalString,
    cidade: optionalString,
    estado: optionalString,
    complemento: optionalString,
    referencia: optionalString,
  }).optional(),
  passageiro: z.object({
    data_nascimento: optionalString,
    turma: optionalString,
    sala: optionalString,
    nome_professor: optionalString,
    observacoes: optionalString,
    escola_id: optionalString,
    periodo: optionalString,
    modalidade: optionalString,
  }).optional(),
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
  escola_id: optionalString,
  periodo: optionalString,
  modalidade: optionalString,
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

export const getRenovacaoContratoConfigSchema = z.object({
  ano: z.union([z.number(), z.string().transform(v => Number(v))]).optional().default(2027),
});

export type GetRenovacaoContratoConfigDTO = z.infer<typeof getRenovacaoContratoConfigSchema>;

export const salvarRenovacaoContratoConfigSchema = z.object({
  ano: z.number().int().default(2027),
  usar_contratos: z.boolean(),
  multa_atraso: z.object({ valor: z.number(), tipo: z.string() }).optional().nullable(),
  juros_atraso: z.object({ valor: z.number(), tipo: z.string() }).optional().nullable(),
  multa_rescisao: z.object({ valor: z.number(), tipo: z.string() }).optional().nullable(),
  secoes: z.array(z.record(z.string(), z.unknown())).optional().nullable(),
  clausulas: z.array(z.string()).optional().nullable(),
});

export type SalvarRenovacaoContratoConfigDTO = z.infer<typeof salvarRenovacaoContratoConfigSchema>;

export const getPeriodoRenovacaoConfigSchema = z.object({
  ano: z.union([z.number(), z.string().transform(v => Number(v))]).optional().default(2027),
});

export type GetPeriodoRenovacaoConfigDTO = z.infer<typeof getPeriodoRenovacaoConfigSchema>;

export const salvarPeriodoRenovacaoConfigSchema = z.object({
  ano: z.number().int().min(2020).max(2100),
  mes_inicio_cobranca: z.number().int().min(1).max(12),
  ano_inicio_cobranca: z.number().int().min(2020).max(2100),
  mes_fim_cobranca: z.number().int().min(1).max(12),
  ano_fim_cobranca: z.number().int().min(2020).max(2100),
  data_inicio_transporte: z.string().optional().nullable(),
  data_fim_transporte: z.string().optional().nullable(),
}).refine((data) => {
  const totalInicio = data.ano_inicio_cobranca * 12 + data.mes_inicio_cobranca;
  const totalFim = data.ano_fim_cobranca * 12 + data.mes_fim_cobranca;
  return totalFim >= totalInicio;
}, {
  message: "O término da cobrança deve ser igual ou posterior ao início",
  path: ["mes_fim_cobranca"],
}).refine((data) => {
  if (data.data_inicio_transporte && data.data_fim_transporte) {
    return new Date(data.data_fim_transporte) >= new Date(data.data_inicio_transporte);
  }
  return true;
}, {
  message: "O término do transporte deve ser igual ou posterior ao início",
  path: ["data_fim_transporte"],
});

export type SalvarPeriodoRenovacaoConfigDTO = z.infer<typeof salvarPeriodoRenovacaoConfigSchema>;
