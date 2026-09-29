import { z } from "zod";

export const checkPhoneSchema = z.object({
  telefone: z.string().min(8, "Telefone inválido")
});

export type CheckPhoneDTO = z.infer<typeof checkPhoneSchema>;

export const setupPinSchema = z.object({
  telefone: z.string().min(8, "Telefone inválido"),
  pin: z.string().length(4, "O PIN deve ter 4 dígitos").regex(/^\d+$/, "O PIN deve conter apenas números")
});

export type SetupPinDTO = z.infer<typeof setupPinSchema>;

export const loginResponsavelSchema = z.object({
  telefone: z.string().min(8, "Telefone inválido"),
  pin: z.string().length(4, "O PIN deve ter 4 dígitos").regex(/^\d+$/, "O PIN deve conter apenas números")
});

export type LoginResponsavelDTO = z.infer<typeof loginResponsavelSchema>;

export const updateDadosComplementaresSchema = z.object({
  cpf: z.string().min(11, "CPF inválido").optional().nullable(),
  email: z.string().email("E-mail inválido").optional().nullable(),
  cep: z.string().optional().nullable(),
  logradouro: z.string().optional().nullable(),
  numero: z.string().optional().nullable(),
  complemento: z.string().optional().nullable(),
  bairro: z.string().optional().nullable(),
  cidade: z.string().optional().nullable(),
  estado: z.string().optional().nullable(),
  referencia: z.string().optional().nullable()
});

export type UpdateDadosComplementaresDTO = z.infer<typeof updateDadosComplementaresSchema>;
