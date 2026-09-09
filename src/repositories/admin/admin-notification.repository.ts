import { supabaseAdmin } from "../../config/supabase.js";
import { isValidFilterValue } from "../../utils/filter.utils.js";
import { NotificationCategoryEnum } from "../../types/enums.js";
import {
  EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO,
  EVENTO_PASSAGEIRO_VENCIMENTO_HOJE,
  EVENTO_PASSAGEIRO_ATRASADO,
  EVENTO_PASSAGEIRO_CONTRATO_DISPONIVEL,
  EVENTO_PASSAGEIRO_CONTRATO_ASSINADO,
  EVENTO_PASSAGEIRO_RECIBO_PAGAMENTO,
  EVENTO_PASSAGEIRO_PIN_RESET,
  EVENTO_ROTA_INICIADA_IDA,
  EVENTO_ROTA_A_CAMINHO_IDA,
  EVENTO_ROTA_EMBARCOU_IDA,
  EVENTO_ROTA_DESFEITO_EMBARQUE_IDA,
  EVENTO_ROTA_INICIADA_VOLTA,
  EVENTO_ROTA_A_CAMINHO_VOLTA,
  EVENTO_ROTA_DESEMBARCOU_VOLTA,
  EVENTO_ROTA_DESFEITO_DESEMBARQUE_VOLTA,
  EVENTO_ROTA_REORDENADA,
  EVENTO_MOTORISTA_TESTE_BOAS_VINDAS,
  EVENTO_MOTORISTA_TESTE_ENCERRADO,
  EVENTO_MOTORISTA_TRIAL_D14_ULTIMO_AVISO,
  EVENTO_MOTORISTA_TRIAL_BONUS_INATIVO,
  EVENTO_MOTORISTA_TRIAL_RECUPERACAO_1,
  EVENTO_MOTORISTA_TRIAL_RECUPERACAO_2,
  EVENTO_MOTORISTA_ASSINATURA_PAGO,
  EVENTO_MOTORISTA_ASSINATURA_VENCENDO,
  EVENTO_MOTORISTA_ASSINATURA_VENCEU,
  EVENTO_MOTORISTA_ASSINATURA_ATRASADA,
  EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO,
  EVENTO_MOTORISTA_RENOVACAO_LEMBRETE,
  EVENTO_MOTORISTA_RENOVACAO_URGENCIA,
  EVENTO_MOTORISTA_RENOVACAO_RECUPERACAO_1,
  EVENTO_MOTORISTA_RENOVACAO_RECUPERACAO_FINAL,
  EVENTO_MOTORISTA_CONTRATO_ASSINADO,
  EVENTO_MOTORISTA_CADASTRO_ADMIN,
  EVENTO_MOTORISTA_RESET_SENHA_ADMIN,
  EVENTO_MOTORISTA_INDICACAO_BONUS,
  EVENTO_MOTORISTA_INDICACAO_CADASTRO,
  EVENTO_MOTORISTA_ANIVERSARIANTES_SEMANA,
  EVENTO_MOTORISTA_RESUMO_SEMANAL_PARCELAS,
  EVENTO_MOTORISTA_EQUIPE_CADASTRO,
  EVENTO_MOTORISTA_EQUIPE_RESET_SENHA,
  EVENTO_MOTORISTA_EQUIPE_STATUS_ALTERADO,
  EVENTO_MOTORISTA_NOVO_PRE_CADASTRO,
  EVENTO_MOTORISTA_AUSENCIA_REGISTRADA,
  EVENTO_MOTORISTA_AUSENCIA_REMOVIDA,
  EVENTO_AUTH_RECUPERACAO_SENHA,
  EVENTO_AUTH_SENHA_ALTERADA,
  EVENTO_ADMIN_NOVO_CADASTRO,
  EVENTO_ADMIN_NOVA_ASSINATURA,
  EVENTO_ADMIN_ASSINATURA_CANCELADA,
  EVENTO_ADMIN_ASSINATURA_FALHA_PAGAMENTO,
  EVENTO_ADMIN_SISTEMA_ALERTA,
  NotificationEvent,
  CUSTO_ESTIMADO_WABA_UNITARIO,
} from "../../config/constants.js";
import type { NotificationKpisDTO } from "../../schemas/admin.schema.js";


export interface AdminNotificationFilters {
  canal?: string;
  status?: string;
  categoria?: NotificationCategoryEnum | string;
  evento?: NotificationEvent | string;
  search?: string;
  searchMotorista?: string;
  dataInicio?: string;
  dataFim?: string;
}

const CATEGORY_EVENTS: Record<NotificationCategoryEnum, NotificationEvent[]> = {
  [NotificationCategoryEnum.TODOS]: [],
  [NotificationCategoryEnum.ROTA]: [
    EVENTO_ROTA_INICIADA_IDA,
    EVENTO_ROTA_A_CAMINHO_IDA,
    EVENTO_ROTA_EMBARCOU_IDA,
    EVENTO_ROTA_DESFEITO_EMBARQUE_IDA,
    EVENTO_ROTA_INICIADA_VOLTA,
    EVENTO_ROTA_A_CAMINHO_VOLTA,
    EVENTO_ROTA_DESEMBARCOU_VOLTA,
    EVENTO_ROTA_DESFEITO_DESEMBARQUE_VOLTA,
    EVENTO_ROTA_REORDENADA,
    EVENTO_MOTORISTA_AUSENCIA_REGISTRADA,
    EVENTO_MOTORISTA_AUSENCIA_REMOVIDA,
  ],
  [NotificationCategoryEnum.COBRANCA]: [
    EVENTO_PASSAGEIRO_RECIBO_PAGAMENTO,
    EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO,
    EVENTO_PASSAGEIRO_VENCIMENTO_HOJE,
    EVENTO_PASSAGEIRO_ATRASADO,
  ],
  [NotificationCategoryEnum.CONTRATO]: [
    EVENTO_PASSAGEIRO_CONTRATO_DISPONIVEL,
    EVENTO_PASSAGEIRO_CONTRATO_ASSINADO,
    EVENTO_MOTORISTA_CONTRATO_ASSINADO,
  ],
  [NotificationCategoryEnum.MOTORISTA]: [
    EVENTO_MOTORISTA_TESTE_BOAS_VINDAS,
    EVENTO_MOTORISTA_TESTE_ENCERRADO,
    EVENTO_MOTORISTA_TRIAL_D14_ULTIMO_AVISO,
    EVENTO_MOTORISTA_TRIAL_BONUS_INATIVO,
    EVENTO_MOTORISTA_TRIAL_RECUPERACAO_1,
    EVENTO_MOTORISTA_TRIAL_RECUPERACAO_2,
    EVENTO_MOTORISTA_ASSINATURA_PAGO,
    EVENTO_MOTORISTA_ASSINATURA_VENCENDO,
    EVENTO_MOTORISTA_ASSINATURA_VENCEU,
    EVENTO_MOTORISTA_ASSINATURA_ATRASADA,
    EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO,
    EVENTO_MOTORISTA_RENOVACAO_LEMBRETE,
    EVENTO_MOTORISTA_RENOVACAO_URGENCIA,
    EVENTO_MOTORISTA_RENOVACAO_RECUPERACAO_1,
    EVENTO_MOTORISTA_RENOVACAO_RECUPERACAO_FINAL,
    EVENTO_MOTORISTA_CADASTRO_ADMIN,
    EVENTO_MOTORISTA_RESET_SENHA_ADMIN,
    EVENTO_MOTORISTA_INDICACAO_BONUS,
    EVENTO_MOTORISTA_INDICACAO_CADASTRO,
    EVENTO_MOTORISTA_ANIVERSARIANTES_SEMANA,
    EVENTO_MOTORISTA_RESUMO_SEMANAL_PARCELAS,
    EVENTO_MOTORISTA_EQUIPE_CADASTRO,
    EVENTO_MOTORISTA_EQUIPE_RESET_SENHA,
    EVENTO_MOTORISTA_EQUIPE_STATUS_ALTERADO,
    EVENTO_MOTORISTA_NOVO_PRE_CADASTRO,
  ],
  [NotificationCategoryEnum.SISTEMA]: [
    EVENTO_AUTH_RECUPERACAO_SENHA,
    EVENTO_AUTH_SENHA_ALTERADA,
    EVENTO_PASSAGEIRO_PIN_RESET,
    EVENTO_ADMIN_NOVO_CADASTRO,
    EVENTO_ADMIN_NOVA_ASSINATURA,
    EVENTO_ADMIN_ASSINATURA_CANCELADA,
    EVENTO_ADMIN_ASSINATURA_FALHA_PAGAMENTO,
    EVENTO_ADMIN_SISTEMA_ALERTA,
  ],
};

function getCategoryEventList(category: string): string[] {
  const norm = category.toUpperCase() as NotificationCategoryEnum;
  const list = CATEGORY_EVENTS[norm] || [];
  const withLower = new Set<string>();
  for (const ev of list) {
    withLower.add(ev);
    withLower.add(ev.toLowerCase());
  }
  return Array.from(withLower);
}

type NotificationFilterableQuery<T> = {
  in: (column: string, values: readonly string[]) => T;
  ilike: (column: string, pattern: string) => T;
  gte: (column: string, value: string) => T;
  lte: (column: string, value: string) => T;
  or: (filters: string) => T;
};

function applyFilters<T extends NotificationFilterableQuery<T>>(query: T, filters?: AdminNotificationFilters): T {
  let filteredQuery = query;

  if (isValidFilterValue(filters?.categoria) && filters.categoria !== NotificationCategoryEnum.TODOS) {
    const eventList = getCategoryEventList(filters!.categoria);
    if (eventList.length > 0) {
      filteredQuery = filteredQuery.in("evento", eventList);
    }
  }

  if (isValidFilterValue(filters?.evento)) {
    filteredQuery = filteredQuery.ilike("evento", filters!.evento.trim());
  }

  if (isValidFilterValue(filters?.canal)) {
    filteredQuery = filteredQuery.ilike("canal", filters!.canal.trim());
  }

  if (isValidFilterValue(filters?.status)) {
    filteredQuery = filteredQuery.ilike("status", filters!.status.trim());
  }

  if (isValidFilterValue(filters?.dataInicio)) {
    const inicio = filters!.dataInicio.length === 10
      ? `${filters!.dataInicio}T00:00:00.000-03:00`
      : filters!.dataInicio;
    filteredQuery = filteredQuery.gte("created_at", inicio);
  }

  if (isValidFilterValue(filters?.dataFim)) {
    const fim = filters!.dataFim.length === 10
      ? `${filters!.dataFim}T23:59:59.999-03:00`
      : filters!.dataFim;
    filteredQuery = filteredQuery.lte("created_at", fim);
  }

  if (isValidFilterValue(filters?.search)) {
    const clean = filters!.search.trim();
    filteredQuery = filteredQuery.or(
      `destinatario.ilike.%${clean}%,evento.ilike.%${clean}%,payload->>nomePassageiro.ilike.%${clean}%,payload->>nomeResponsavel.ilike.%${clean}%`
    );
  }

  return filteredQuery;
}

async function resolveDriverUserIds(searchMotorista?: string): Promise<string[] | null> {
  if (!isValidFilterValue(searchMotorista)) return null;

  const clean = searchMotorista!.trim();
  const digits = clean.replace(/\D/g, "");
  const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean);

  if (isId) {
    return [clean];
  }

  let userQuery = supabaseAdmin.from("usuarios").select("id");
  const orConditions: string[] = [
    `nome.ilike.%${clean}%`,
    `apelido.ilike.%${clean}%`,
    `email.ilike.%${clean}%`,
  ];
  if (digits.length >= 3) {
    orConditions.push(`cpfcnpj.ilike.%${digits}%`, `telefone.ilike.%${digits}%`);
  }
  userQuery = userQuery.or(orConditions.join(","));
  const { data: matchedUsers } = await userQuery;

  if (matchedUsers && matchedUsers.length > 0) {
    return matchedUsers.map((u) => u.id);
  }
  return ["00000000-0000-0000-0000-000000000000"];
}

export const adminNotificationRepository = {
  async getUserNotifications(userId: string, from: number, to: number, filters?: AdminNotificationFilters) {
    let query = supabaseAdmin
      .from("fila_notificacoes")
      .select("*", { count: "exact" })
      .eq("usuario_id", userId);

    query = applyFilters(query, filters);

    return query
      .order("created_at", { ascending: false })
      .range(from, to);
  },

  async getPassengerNotifications(passageiroId: string, from: number, to: number, filters?: AdminNotificationFilters) {
    let query = supabaseAdmin
      .from("fila_notificacoes")
      .select("*", { count: "exact" })
      .eq("passageiro_id", passageiroId);

    query = applyFilters(query, filters);

    return query
      .order("created_at", { ascending: false })
      .range(from, to);
  },

  async getGlobalNotifications(from: number, to: number, filters?: AdminNotificationFilters) {
    let query = supabaseAdmin
      .from("fila_notificacoes")
      .select("*, usuarios(id, nome, email, telefone, cpfcnpj)", { count: "exact" });

    const driverIds = await resolveDriverUserIds(filters?.searchMotorista);
    if (driverIds) {
      query = query.in("usuario_id", driverIds);
    }

    query = applyFilters(query, filters);

    return query
      .order("created_at", { ascending: false })
      .range(from, to);
  },

  async getGlobalNotificationKpis(filters?: AdminNotificationFilters): Promise<NotificationKpisDTO> {
    let query = supabaseAdmin
      .from("fila_notificacoes")
      .select("canal, status");

    const driverIds = await resolveDriverUserIds(filters?.searchMotorista);
    if (driverIds) {
      query = query.in("usuario_id", driverIds);
    }

    query = applyFilters(query, filters);

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const rows = data || [];
    let sent = 0;
    let failed = 0;
    let wabaSent = 0;
    let wabaFailed = 0;
    const canais = {
      waba: 0,
      firebase: 0,
      resend: 0,
      telegram: 0,
      evolution: 0,
      sms: 0,
    };

    for (const row of rows) {
      const statusUpper = (row.status || "").toUpperCase();
      const canalUpper = (row.canal || "").toUpperCase();

      if (statusUpper === "SENT" || statusUpper === "DELIVERED") {
        sent++;
      } else if (statusUpper === "FAILED") {
        failed++;
      }

      if (canalUpper === "WABA") {
        canais.waba++;
        if (statusUpper === "SENT" || statusUpper === "DELIVERED") {
          wabaSent++;
        } else if (statusUpper === "FAILED") {
          wabaFailed++;
        }
      } else if (canalUpper === "FIREBASE") {
        canais.firebase++;
      } else if (canalUpper === "RESEND") {
        canais.resend++;
      } else if (canalUpper === "TELEGRAM") {
        canais.telegram++;
      } else if (canalUpper === "EVOLUTION") {
        canais.evolution++;
      } else if (canalUpper === "SMS") {
        canais.sms++;
      }
    }

    const total = rows.length;
    const custoEstimadoWaba = Number((wabaSent * CUSTO_ESTIMADO_WABA_UNITARIO).toFixed(2));
    const taxaSucesso = total > 0 ? Number((((total - failed) / total) * 100).toFixed(1)) : 100;

    return {
      total,
      sent,
      failed,
      wabaSent,
      wabaFailed,
      custoEstimadoWaba,
      taxaSucesso,
      canais,
    };
  },
};


