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
