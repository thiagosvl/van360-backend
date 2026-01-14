import { z } from "zod";
import { moneyToNumber } from "../../utils/currency.utils.js";

const optionalString = z.string().optional().or(z.literal("")).transform(v => v === "" ? undefined : v);
const optionalNumber = z.union([z.number(), z.string().length(0).transform(() => undefined), z.string().min(1).transform(val => Number(val))]).optional();

export const createPassageiroSchema = z.object({
    nome: z.string().min(1, "Nome é obrigatório"),
    usuario_id: z.string().uuid("ID do usuário inválido"),
    escola_id: z.string().uuid().optional().nullable().or(z.literal("")).transform(v => (v === "" || v === "none") ? null : v),
    veiculo_id: z.string().uuid().optional().nullable().or(z.literal("")).transform(v => (v === "" || v === "none") ? null : v),
    // Campos do App antigo / Flexíveis
    nome_responsavel: optionalString,
    responsavel_nome: optionalString, // Alias comum
    cpf_responsavel: optionalString,
    responsavel_cpf: optionalString, // Alias comum
    telefone_responsavel: optionalString,
    responsavel_telefone: optionalString, // Alias comum
    email_responsavel: z.string().email().optional().or(z.literal("")).transform(v => v === "" ? undefined : v),
    
    // Endereço
    logradouro: optionalString,
    endereco_logradouro: optionalString,
    bairro: optionalString,
    endereco_bairro: optionalString,
    cidade: optionalString,
    endereco_cidade: optionalString,
    referencia: optionalString,
    observacoes: optionalString,

    // Financeiro
    dia_vencimento: optionalNumber,
    valor_cobranca: z.union([z.number(), z.string()]).transform(val => val === "" ? undefined : (typeof val === 'string' ? moneyToNumber(val) : val)).optional(), 
    valor_mensalidade: z.union([z.number(), z.string()]).transform(val => val === "" ? undefined : (typeof val === 'string' ? moneyToNumber(val) : val)).optional(), 

    // Controle
    ativo: z.boolean().optional(),
    enviar_cobranca_automatica: z.boolean().optional(),
    emitir_cobranca_mes_atual: z.boolean().optional(),
    periodo: z.string().optional().or(z.literal("")).transform(v => v ? v.toLowerCase() : undefined),
    genero: optionalString,
}).passthrough(); // Permite outros campos não estritos por enquanto (migração suave)

export type CreatePassageiroDTO = z.infer<typeof createPassageiroSchema>;

export const updatePassageiroSchema = createPassageiroSchema.partial();
export type UpdatePassageiroDTO = z.infer<typeof updatePassageiroSchema>;

export const listPassageirosFiltersSchema = z.object({
    search: z.string().optional(),
    escola: z.string().optional(),
    veiculo: z.string().optional(),
    status: z.string().optional(),
    periodo: z.string().optional(),
    ativo: z.string().optional(), // Query params vêm como string
    enviar_cobranca_automatica: z.string().optional(),
});

export type ListPassageirosFiltersDTO = z.infer<typeof listPassageirosFiltersSchema>;

export const toggleAtivoSchema = z.object({
    novoStatus: z.boolean()
});

export type ToggleAtivoDTO = z.infer<typeof toggleAtivoSchema>;

export const finalizePreCadastroSchema = z.object({
  data: updatePassageiroSchema, // Partial create
  usuarioId: z.string().uuid(),
  emitir_cobranca_mes_atual: z.boolean()
});

export type FinalizePreCadastroDTO = z.infer<typeof finalizePreCadastroSchema>;
