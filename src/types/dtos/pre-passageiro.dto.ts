import { z } from 'zod';
import { PassageiroGenero, PassageiroModalidade, PeriodoEnum } from '../enums.js';

export const createPrePassageiroSchema = z.object({
  usuario_id: z.string().uuid('ID do motorista inválido'),
  nome: z.string().min(2, 'Nome do passageiro é obrigatório'),
  nome_responsavel: z.string().min(2, 'Nome do responsável é obrigatório'),
  email_responsavel: z.string().email('E-mail inválido').optional().or(z.literal('')),
  cpf_responsavel: z.string().optional().or(z.literal('')),
  telefone_responsavel: z.string().optional().or(z.literal('')),
  escola_id: z.string().uuid().optional().nullable().or(z.literal('')),
  periodo: z.nativeEnum(PeriodoEnum).optional().nullable().or(z.literal('')),
  valor_cobranca: z.union([z.string(), z.number()]).optional().nullable(),
  dia_vencimento: z.union([z.string(), z.number()]).optional().nullable(),
  logradouro: z.string().optional().nullable().or(z.literal('')),
  numero: z.string().optional().nullable().or(z.literal('')),
  bairro: z.string().optional().nullable().or(z.literal('')),
  cidade: z.string().optional().nullable().or(z.literal('')),
  estado: z.string().length(2).optional().nullable().or(z.literal('')),
  cep: z.string().optional().nullable().or(z.literal('')),
  referencia: z.string().optional().nullable().or(z.literal('')),
  observacoes: z.string().optional().nullable().or(z.literal('')),
  modalidade: z.nativeEnum(PassageiroModalidade).optional().nullable().or(z.literal('')),
  genero: z.nativeEnum(PassageiroGenero).optional().nullable().or(z.literal('')),
  parentesco_responsavel: z.string().optional().nullable().or(z.literal('')),
  data_inicio_transporte: z.string().optional().nullable().or(z.literal('')),
  data_fim_transporte: z.string().optional().nullable().or(z.literal('')),
  data_nascimento: z.string().optional().nullable().or(z.literal('')),
});

export type CreatePrePassageiroDTO = z.infer<typeof createPrePassageiroSchema>;
