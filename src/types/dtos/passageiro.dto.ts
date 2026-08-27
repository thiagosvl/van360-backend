import { z } from "zod";
import { moneyToNumber } from "../../utils/currency.utils.js";
import { parseLocalDate, getNowBR } from "../../utils/date.utils.js";
import { ParentescoResponsavel } from "../enums.js";

const optionalString = z.union([z.string(), z.null(), z.undefined()]).transform(v => {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  return v;
});
const optionalNumber = z.union([z.number(), z.string().length(0).transform(() => undefined), z.string().min(1).transform(val => Number(val))]).optional();

const optionalEmail = z.union([
  z.string().email("E-mail inválido"),
  z.literal(""),
  z.null(),
  z.undefined()
]).transform(v => {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  return v;
});

export const responsavelPrincipalInputSchema = z.object({
  nome: z.string().min(1, "Nome do responsável é obrigatório"),
  telefone: z.string().min(8, "Telefone do responsável é obrigatório"),
  cpf: optionalString,
  email: optionalEmail,
  parentesco: z.union([z.nativeEnum(ParentescoResponsavel), z.string(), z.null(), z.undefined()]).optional().nullable(),
  logradouro: optionalString,
  numero: optionalString,
  bairro: optionalString,
  cidade: optionalString,
  estado: optionalString,
  cep: optionalString,
  referencia: optionalString,
  complemento: optionalString,
});

export const createPassageiroSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  usuario_id: z.string().uuid("ID do usuário inválido"),
  escola_id: z.string().uuid().optional().nullable().or(z.literal("")).transform(v => (v === "" || v === "none") ? null : v),
  veiculo_id: z.string().uuid().optional().nullable().or(z.literal("")).transform(v => (v === "" || v === "none") ? null : v),
  responsavel_principal: responsavelPrincipalInputSchema.optional().nullable(),


  // Observações
  observacoes: optionalString,

  // Financeiro
  dia_vencimento: z.union([z.number(), z.string(), z.null(), z.undefined()]).transform(val => {
    if (val === "" || val === null || val === undefined) return undefined;
    return typeof val === 'string' ? Number(val) : val;
  }).optional(),
  valor_cobranca: z.union([z.number(), z.string(), z.null(), z.undefined()]).transform(val => {
    if (val === "" || val === null || val === undefined) return undefined;
    return typeof val === 'string' ? moneyToNumber(val) : val;
  }).optional(),

  // Controle
  ativo: z.boolean().optional(),
  isento: z.boolean().optional(),
  enviar_notificacoes: z.boolean().optional(),

  periodo: z.union([z.string(), z.null(), z.undefined()]).transform(v => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    return v.toLowerCase();
  }),
  genero: optionalString,

  // Novos Campos
  modalidade: z.union([z.string(), z.null(), z.undefined()]).transform(v => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    return v;
  }),
  data_nascimento: z.union([z.string(), z.null(), z.undefined()]).transform(v => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    return parseLocalDate(v);
  }).refine(v => {
    if (!v) return true;
    return v.getTime() <= getNowBR().getTime();
  }, { message: "Data de nascimento não pode ser no futuro" }),
  turma: optionalString,
  nome_professor: optionalString,
  data_inicio_transporte: z.union([z.string(), z.null(), z.undefined()]).transform(v => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    return parseLocalDate(v);
  }),
  data_fim_transporte: z.union([z.string(), z.null(), z.undefined()]).transform(v => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    return parseLocalDate(v);
  }),
  data_inicio_cobranca: z.union([z.string(), z.null(), z.undefined()]).transform(v => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    return parseLocalDate(v);
  }),
  data_fim_cobranca: z.union([z.string(), z.null(), z.undefined()]).transform(v => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    return parseLocalDate(v);
  }),

}).passthrough(); // Permite outros campos não estritos por enquanto (migração suave)

export type CreatePassageiroDTO = z.infer<typeof createPassageiroSchema>;

export const updatePassageiroSchema = createPassageiroSchema.extend({
  responsavel_principal: responsavelPrincipalInputSchema.partial().optional().nullable(),
}).partial();
export type UpdatePassageiroDTO = z.infer<typeof updatePassageiroSchema>;

export const listPassageirosFiltersSchema = z.object({
  search: z.string().optional(),
  escola: z.string().optional(),
  veiculo: z.string().optional(),
  status: z.string().optional(),
  periodo: z.string().optional(),
  ativo: z.string().optional(), // Query params vêm como string
  page: z.union([z.number(), z.string().transform(v => Number(v))]).optional(),
  limit: z.union([z.number(), z.string().transform(v => Number(v))]).optional(),
});

export type ListPassageirosFiltersDTO = z.infer<typeof listPassageirosFiltersSchema>;

export const toggleAtivoSchema = z.object({
  novoStatus: z.boolean()
});

export type ToggleAtivoDTO = z.infer<typeof toggleAtivoSchema>;

export const finalizePreCadastroSchema = z.object({
  data: updatePassageiroSchema, // Partial create
  usuarioId: z.string().uuid(),

});

export type FinalizePreCadastroDTO = z.infer<typeof finalizePreCadastroSchema>;

export const getAniversariantesQuerySchema = z.object({
  mes: z.string().transform(v => Number(v)).refine(val => val >= 1 && val <= 12, "Mês inválido")
});

export const createResponsavelAdicionalSchema = z.object({
  nome: z.string().min(2, "Nome é obrigatório"),
  telefone: z.string().min(8, "Telefone é obrigatório"),
  cpf: optionalString,
  email: optionalEmail,
  parentesco: z.nativeEnum(ParentescoResponsavel, { message: "Parentesco é obrigatório" }),
  logradouro: optionalString,
  numero: optionalString,
  bairro: optionalString,
  cidade: optionalString,
  estado: optionalString,
  cep: optionalString,
  referencia: optionalString,
  complemento: optionalString,
  passageiroId: optionalString,
  tornar_principal: z.boolean().optional(),
});

export type CreateResponsavelAdicionalDTO = z.infer<typeof createResponsavelAdicionalSchema>;

export const updateResponsavelAdicionalSchema = createResponsavelAdicionalSchema.partial();
export type UpdateResponsavelAdicionalDTO = z.infer<typeof updateResponsavelAdicionalSchema>;

