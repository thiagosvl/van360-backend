import { z } from "zod";
import { ModalidadeCobrancaEnum } from "../types/enums.js";

export const updateMotoristaFinanceiroSchema = z.object({
  cobranca_automatica_ativa: z.boolean().optional(),
  enviar_recibo_automatico: z.boolean().optional(),
  chave_pix_repasse: z.string().trim().min(1, "Chave Pix é obrigatória").nullable().optional(),
  tipo_chave_pix: z.enum(["CPF", "CNPJ", "EMAIL", "TELEFONE", "ALEATORIA"]).nullable().optional(),
  repassar_taxa_pais_padrao: z.boolean().optional(),
  taxa_personalizada: z.number().nonnegative().nullable().optional(),
  modalidade_cobranca: z.nativeEnum(ModalidadeCobrancaEnum).optional()
});

export type UpdateMotoristaFinanceiroInput = z.infer<typeof updateMotoristaFinanceiroSchema>;
