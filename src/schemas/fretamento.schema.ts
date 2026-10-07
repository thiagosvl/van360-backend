import { z } from "zod";

export const fretamentoTipoEnum = z.enum(["fretamento", "passeio"]);
export const fretamentoStatusEnum = z.enum(["pendente", "confirmado", "concluido", "cancelado"]);
export const fretamentoPagamentoStatusEnum = z.enum(["pendente", "pago_parcial", "quitado"]);
export const participantePagamentoStatusEnum = z.enum(["pendente", "pago"]);
export const tipoPagamentoEnum = z.enum([
  "dinheiro",
  "cartao-credito",
  "cartao-debito",
  "transferencia",
  "PIX",
  "boleto",
]);

export const criarFretamentoSchema = z.object({
  tipo: fretamentoTipoEnum,
  titulo: z.string().min(2, "Título deve ter no mínimo 2 caracteres").max(255),
  origem: z.string().max(255).optional().nullable(),
  destino: z.string().min(2, "Destino é obrigatório").max(255),
  data_inicio: z.string().min(1, "Data de início é obrigatória"),
  data_fim: z.string().optional().nullable(),
  contratante_nome: z.string().max(255).optional().nullable(),
  contratante_telefone: z.string().max(50).optional().nullable(),
  valor_total: z.coerce.number().min(0).default(0),
  valor_por_pessoa: z.coerce.number().min(0).optional().nullable(),
  vagas_totais: z.coerce.number().int().min(1).optional().nullable(),
  chave_pix: z.string().max(255).optional().nullable(),
  observacoes: z.string().optional().nullable(),
  veiculos_ids: z.array(z.string().uuid()).optional(),
  sinal_inicial: z
    .object({
      valor: z.coerce.number().positive(),
      tipo_pagamento: tipoPagamentoEnum,
      data_pagamento: z.string().optional(),
    })
    .optional()
    .nullable(),
});

export const atualizarFretamentoSchema = z.object({
  titulo: z.string().min(2).max(255).optional(),
  origem: z.string().max(255).optional().nullable(),
  destino: z.string().min(2).max(255).optional(),
  data_inicio: z.string().optional(),
  data_fim: z.string().optional().nullable(),
  contratante_nome: z.string().max(255).optional().nullable(),
  contratante_telefone: z.string().max(50).optional().nullable(),
  valor_total: z.coerce.number().min(0).optional(),
  valor_por_pessoa: z.coerce.number().min(0).optional().nullable(),
  vagas_totais: z.coerce.number().int().min(1).optional().nullable(),
  chave_pix: z.string().max(255).optional().nullable(),
  observacoes: z.string().optional().nullable(),
  status: fretamentoStatusEnum.optional(),
  veiculos_ids: z.array(z.string().uuid()).optional(),
});

export const registrarPagamentoSchema = z.object({
  valor: z.coerce.number().positive("Valor deve ser maior que zero"),
  tipo_pagamento: tipoPagamentoEnum,
  data_pagamento: z.string().optional(),
  descricao: z.string().max(255).optional().nullable(),
});

export const adicionarParticipanteSchema = z.object({
  passageiro_id: z.string().uuid().optional().nullable(),
  nome: z.string().min(2, "Nome é obrigatório").max(255),
  is_proprio_responsavel: z.boolean().default(false),
  responsavel_nome: z.string().max(255).optional().nullable(),
  telefone: z.string().max(50).optional().nullable(),
  endereco: z.string().optional().nullable(),
  valor: z.coerce.number().min(0).optional(),
  observacoes: z.string().optional().nullable(),
});

export const atualizarStatusParticipanteSchema = z.object({
  status_pagamento: participantePagamentoStatusEnum,
  tipo_pagamento: tipoPagamentoEnum.optional().nullable(),
});

export const listarFretamentosQuerySchema = z.object({
  mes: z.coerce.number().int().min(1).max(12),
  ano: z.coerce.number().int().min(2020).max(2050),
  tipo: fretamentoTipoEnum.optional(),
  status: fretamentoStatusEnum.optional(),
});
