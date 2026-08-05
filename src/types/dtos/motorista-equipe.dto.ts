import { z } from "zod";
import { UserType } from "../enums.js";

export const createMembroEquipeSchema = z.object({
  nome: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  apelido: z.string().optional(),
  razao_social: z.string().optional(),
  email: z.string().email("E-mail inválido"),
  telefone: z.string().min(10, "Telefone inválido"),
  cpf: z.string().min(11, "CPF/CNPJ é obrigatório"),
  tipo: z.enum([UserType.MOTORISTA_AUXILIAR, UserType.MONITOR]),
  veiculo_id: z.string().uuid("Selecione um veículo válido"),
  senha: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
});

export type CreateMembroEquipeDTO = z.infer<typeof createMembroEquipeSchema>;

export const updateMembroEquipeSchema = z.object({
  nome: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").optional(),
  apelido: z.string().optional(),
  razao_social: z.string().optional(),
  telefone: z.string().min(10, "Telefone inválido").optional(),
  cpf: z.string().min(11, "CPF/CNPJ inválido").optional(),
  tipo: z.enum([UserType.MOTORISTA_AUXILIAR, UserType.MONITOR]).optional(),
  veiculo_id: z.string().uuid("Veículo inválido").optional(),
  ativo: z.boolean().optional(),
});

export type UpdateMembroEquipeDTO = z.infer<typeof updateMembroEquipeSchema>;

export const redefinirSenhaMembroSchema = z.object({
  nova_senha: z.string().min(6, "A nova senha deve ter no mínimo 6 caracteres"),
});

export type RedefinirSenhaMembroDTO = z.infer<typeof redefinirSenhaMembroSchema>;
