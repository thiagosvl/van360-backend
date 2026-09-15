import { z } from "zod";

export const atualizarUsuarioSchema = z.object({
  nome: z.string().min(2).optional(),
  razao_social: z.string().nullable().optional(),
  apelido: z.string().nullable().optional(),
  telefone: z.string().optional(),
  assinatura_digital_url: z.string().nullable().optional(),
  logo_url: z.string().url().nullable().optional(),
  config_contrato: z.record(z.string(), z.unknown()).nullable().optional(),
  data_nascimento: z.string().nullable().optional(),
});

export type AtualizarUsuarioInput = z.infer<typeof atualizarUsuarioSchema>;
