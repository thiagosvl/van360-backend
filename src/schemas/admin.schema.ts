import { z } from "zod";
import { SubscriptionStatus, ConfigKey } from "../types/enums.js";
import {
  EVENTO_MOTORISTA_RESUMO_SEMANAL_PARCELAS,
  EVENTO_MOTORISTA_ANIVERSARIANTES_SEMANA,
  EVENTO_MOTORISTA_ASSINATURA_VENCENDO,
  EVENTO_MOTORISTA_TRIAL_D14_ULTIMO_AVISO,
  EVENTO_MOTORISTA_TESTE_ENCERRADO,
} from "../config/constants.js";

export const updateUserAdminSchema = z.object({
  nome: z.string().min(2).max(120).optional(),
  razao_social: z.string().optional().nullable(),
  apelido: z.string().max(60).optional().nullable(),
  email: z.string().email().optional(),
  telefone: z.string().min(10).max(15).optional(),
  cpfcnpj: z.string().min(11).max(14).optional(),
  ativo: z.boolean().optional(),
  data_nascimento: z.string().optional().nullable(),
});

export const updateSubscriptionAdminSchema = z.object({
  plano_id: z.string().uuid().optional(),
  status: z.nativeEnum(SubscriptionStatus).optional(),
  data_vencimento: z.string().optional().nullable(),
  trial_ends_at: z.string().optional().nullable(),
  valor_base_mensal: z.coerce.number().min(0).optional().nullable(),
  valor_base_anual: z.coerce.number().min(0).optional().nullable(),
  valor_promocional_mensal: z.coerce.number().min(0).optional().nullable(),
  valor_promocional_anual: z.coerce.number().min(0).optional().nullable(),
  data_fim_promocao: z.string().optional().nullable(),
});

export const updateConfigSchema = z.object({
  chave: z.string().min(1),
  valor: z.string(),
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.string().optional(),
  tipo: z.string().optional(),
});

export const listUserLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(20),
  dataInicio: z.string().optional(),
  dataFim: z.string().optional(),
  acao: z.string().optional(),
  entidade: z.string().optional(),
});

export const listLoginAttemptsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(20),
  data_inicio: z.string().optional(),
  data_fim: z.string().optional(),
  search_cpf: z.string().optional(),
});

export const listGlobalLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(20),
  dataInicio: z.string().optional(),
  dataFim: z.string().optional(),
  acao: z.string().optional(),
  entidade: z.string().optional(),
  search_cpf: z.string().optional(),
});

export type UpdateUserAdminDTO = z.infer<typeof updateUserAdminSchema>;
export type UpdateSubscriptionAdminDTO = z.infer<typeof updateSubscriptionAdminSchema>;
export type UpdateConfigDTO = z.infer<typeof updateConfigSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type ListUserLogsQuery = z.infer<typeof listUserLogsQuerySchema>;
export type ListLoginAttemptsQuery = z.infer<typeof listLoginAttemptsQuerySchema>;
export type ListGlobalLogsQuery = z.infer<typeof listGlobalLogsQuerySchema>;

export const updatePlanSchema = z.object({
  valor: z.coerce.number().min(0).optional(),
  valor_promocional: z.coerce.number().min(0).nullable().optional(),
});
export type UpdatePlanDTO = z.infer<typeof updatePlanSchema>;

export const createUserAdminSchema = z.object({
  nome: z.string().min(2).max(120),
  razao_social: z.string().optional().nullable(),
  email: z.string().email(),
  telefone: z.string().min(10).max(15),
  cpfcnpj: z.string().min(11).max(14),
  data_nascimento: z.string().min(10, "Data de nascimento inválida"),
  senha: z.string().min(6),
});
export type CreateUserAdminDTO = z.infer<typeof createUserAdminSchema>;

export const dispatchDriverNotificationSchema = z.object({
  evento: z.enum([
    EVENTO_MOTORISTA_RESUMO_SEMANAL_PARCELAS,
    EVENTO_MOTORISTA_ANIVERSARIANTES_SEMANA,
    EVENTO_MOTORISTA_ASSINATURA_VENCENDO,
    EVENTO_MOTORISTA_TRIAL_D14_ULTIMO_AVISO,
    EVENTO_MOTORISTA_TESTE_ENCERRADO,
  ]),
});
export type DispatchDriverNotificationDTO = z.infer<typeof dispatchDriverNotificationSchema>;

export const listUserNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(25),
  canal: z.string().optional(),
  status: z.string().optional(),
  categoria: z.string().optional(),
  evento: z.string().optional(),
  search: z.string().optional(),
  searchMotorista: z.string().optional(),
  dataInicio: z.string().optional(),
  dataFim: z.string().optional(),
});
export type ListUserNotificationsQuery = z.infer<typeof listUserNotificationsQuerySchema>;

export const retrySingleNotificationSchema = z.object({
  executeImmediately: z.boolean().optional().default(true),
});
export type RetrySingleNotificationDTO = z.infer<typeof retrySingleNotificationSchema>;

export const retryBulkNotificationsSchema = z.object({
  ids: z.array(z.string().uuid()).optional(),
  filters: listUserNotificationsQuerySchema.omit({ page: true, limit: true }).optional(),
}).refine(data => (data.ids && data.ids.length > 0) || (data.filters && Object.keys(data.filters).length > 0), {
  message: "É necessário informar uma lista de IDs ou filtros válidos para retentativa em lote.",
});
export type RetryBulkNotificationsDTO = z.infer<typeof retryBulkNotificationsSchema>;

export interface NotificationKpisDTO {
  total: number;
  sent: number;
  failed: number;
  cancelled: number;
  wabaSent: number;
  wabaFailed: number;
  custoEstimadoWaba: number;
  taxaSucesso: number;
  canais: {
    waba: number;
    firebase: number;
    resend: number;
    telegram: number;
    evolution: number;
    sms: number;
  };
}

export const listUsersLatestActivityQuerySchema = z.object({
  search: z.string().optional(),
  sort: z.enum(["inactive_first", "recent_first", "oldest_first", "newest_first", "name_asc"]).default("recent_first"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  healthStatus: z.enum(["all", "active", "alert", "risk", "inactive"]).default("all"),
  subscriptionStatus: z.string().default("active_trial"),
});
export type ListUsersLatestActivityQuery = z.infer<typeof listUsersLatestActivityQuerySchema>;

export const getMotoristasRadarStatsQuerySchema = z.object({
  subscriptionStatus: z.string().default("active_trial"),
});
export type GetMotoristasRadarStatsQuery = z.infer<typeof getMotoristasRadarStatsQuerySchema>;

export interface MotoristaLatestActivityDTO {
  id: string;
  nome: string;
  apelido: string | null;
  telefone: string;
  email: string;
  cadastrado_em: string;
  ultima_acao: string | null;
  ultima_descricao: string | null;
  ultima_atividade_at: string | null;
  assinatura_status: string | null;
  assinatura_vencimento: string | null;
  dias_inativo: number;
}

export interface MotoristasLatestActivityResponseDTO {
  data: MotoristaLatestActivityDTO[];
  total: number;
  page: number;
  limit: number;
}

export interface MotoristasRadarStatsDTO {
  totalMotoristas: number;
  totalAtivos: number;
  totalAlerta: number;
  totalEmRisco: number;
  totalSemAtividade: number;
}

export const setReferralAdminSchema = z.object({
  indicadorId: z.string().uuid("ID do indicador inválido"),
});
export type SetReferralAdminDTO = z.infer<typeof setReferralAdminSchema>;
