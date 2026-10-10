import { z } from "zod";
import { ModoCobrancaEnum, ContractMultaTipo } from "../types/enums.js";

export const updateMotoristaFinanceiroSchema = z.object({
  modo_cobranca: z.nativeEnum(ModoCobrancaEnum).optional(),
  enviar_recibo_automatico: z.boolean().optional(),
  chave_pix_repasse: z.string().trim().min(1, "Chave Pix é obrigatória").nullable().optional(),
  tipo_chave_pix: z.enum(["CPF", "CNPJ", "EMAIL", "TELEFONE", "ALEATORIA"]).nullable().optional(),
  taxa_personalizada: z.number().nonnegative().nullable().optional(),
  cobrar_multa_atraso: z.boolean().optional(),
  multa_atraso_tipo: z.nativeEnum(ContractMultaTipo).nullable().optional(),
  multa_atraso_valor: z.number().nonnegative().nullable().optional(),
  cobrar_juros_atraso: z.boolean().optional(),
  juros_atraso_tipo: z.nativeEnum(ContractMultaTipo).nullable().optional(),
  juros_atraso_valor: z.number().nonnegative().nullable().optional(),
  dias_carencia_atraso: z.number().int().nonnegative().optional(),
  dias_validade_apos_vencimento: z.number().int().nonnegative().optional(),
  aplicar_a_todos: z.boolean().optional(),
});

export type UpdateMotoristaFinanceiroInput = z.infer<typeof updateMotoristaFinanceiroSchema>;
