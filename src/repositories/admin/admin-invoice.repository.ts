import { supabaseAdmin } from "../../config/supabase.js";
import { SubscriptionInvoiceStatus } from "../../types/enums.js";

export interface ListAdminInvoicesFilterParams {
  from: number;
  to: number;
  search?: string;
  status?: string;
  user_status?: string;
  metodo?: string;
  tipo?: string;
  vencimento_de?: string;
  vencimento_ate?: string;
  todayIso: string;
  next7DaysIso: string;
}

export const adminInvoiceRepository = {
  async listInvoices(params: ListAdminInvoicesFilterParams) {
    let targetUserIds: string[] | null = null;

    if (params.search && params.search.trim().length > 0) {
      const term = `%${params.search.trim()}%`;
      const { data: matchedUsers } = await supabaseAdmin
        .from("usuarios")
        .select("id")
        .or(`nome.ilike.${term},apelido.ilike.${term},email.ilike.${term},telefone.ilike.${term}`);

      const userIdsFromSearch = (matchedUsers || []).map((u) => u.id);
      if (userIdsFromSearch.length === 0) {
        return { data: [], total: 0 };
      }
      targetUserIds = userIdsFromSearch;
    }

    if (params.user_status && params.user_status.trim().length > 0) {
      const { data: matchedSubs } = await supabaseAdmin
        .from("assinaturas")
        .select("usuario_id")
        .eq("status", params.user_status.trim().toLowerCase());

      const userIdsFromSubs = (matchedSubs || []).map((s) => s.usuario_id);
      if (userIdsFromSubs.length === 0) {
        return { data: [], total: 0 };
      }

      if (targetUserIds) {
        const setSubs = new Set(userIdsFromSubs);
        targetUserIds = targetUserIds.filter((id) => setSubs.has(id));
        if (targetUserIds.length === 0) {
          return { data: [], total: 0 };
        }
      } else {
        targetUserIds = userIdsFromSubs;
      }
    }

    let q = supabaseAdmin
      .from("assinatura_faturas")
      .select(
        `
        id,
        usuario_id,
        assinatura_id,
        plano_id,
        status,
        valor,
        metodo_pagamento,
        data_vencimento,
        data_pagamento,
        pix_copy_paste,
        gateway_txid,
        created_at,
        updated_at,
        usuarios(id, nome, apelido, logo_url, telefone, email),
        planos(id, nome, identificador),
        assinaturas(id, status, data_vencimento, trial_ends_at)
      `,
        { count: "exact" }
      );

    if (targetUserIds !== null) {
      q = q.in("usuario_id", targetUserIds);
    }

    if (params.status) {
      const st = params.status.trim().toLowerCase();
      if (st === "open") {
        q = q.in("status", [SubscriptionInvoiceStatus.PENDING, SubscriptionInvoiceStatus.FAILED]);
      } else if (st === "vencidas" || st === "hoje" || st === "proximos7dias") {
        q = q.in("status", [SubscriptionInvoiceStatus.PENDING, SubscriptionInvoiceStatus.FAILED]);

        let subQuery = supabaseAdmin.from("assinaturas").select("id");
        if (st === "vencidas") {
          subQuery = subQuery.lt("data_vencimento", `${params.todayIso}T00:00:00-03:00`);
        } else if (st === "hoje") {
          subQuery = subQuery
            .gte("data_vencimento", `${params.todayIso}T00:00:00-03:00`)
            .lte("data_vencimento", `${params.todayIso}T23:59:59.999-03:00`);
        } else if (st === "proximos7dias") {
          subQuery = subQuery
            .gte("data_vencimento", `${params.todayIso}T00:00:00-03:00`)
            .lte("data_vencimento", `${params.next7DaysIso}T23:59:59.999-03:00`);
        }

        const { data: matchedSubs } = await subQuery;
        const subIds = (matchedSubs || []).map((s: { id: string }) => s.id);
        if (subIds.length === 0) {
          return { data: [], total: 0 };
        }
        q = q.in("assinatura_id", subIds);
      } else {
        q = q.eq("status", params.status.trim().toUpperCase());
      }
    }

    if (params.metodo) {
      q = q.eq("metodo_pagamento", params.metodo.trim().toLowerCase());
    }

    if (params.vencimento_de || params.vencimento_ate) {
      let subQuery = supabaseAdmin.from("assinaturas").select("id");
      if (params.vencimento_de) {
        subQuery = subQuery.gte("data_vencimento", `${params.vencimento_de.trim()}T00:00:00-03:00`);
      }
      if (params.vencimento_ate) {
        subQuery = subQuery.lte("data_vencimento", `${params.vencimento_ate.trim()}T23:59:59.999-03:00`);
      }
      const { data: matchedSubs } = await subQuery;
      const subIds = (matchedSubs || []).map((s: { id: string }) => s.id);
      if (subIds.length === 0) {
        return { data: [], total: 0 };
      }
      q = q.in("assinatura_id", subIds);
    }

    q = q
      .order("data_vencimento", { ascending: false })
      .order("created_at", { ascending: false })
      .range(params.from, params.to);

    const { data, count, error } = await q;

    if (error) {
      throw error;
    }

    return {
      data: data || [],
      total: count || 0,
    };
  },

  async getInvoiceStatsRaw(primeiroDiaMesIso: string) {
    return Promise.all([
      supabaseAdmin
        .from("assinatura_faturas")
        .select("id, valor, status, data_vencimento, assinaturas(id, data_vencimento, trial_ends_at)")
        .in("status", [SubscriptionInvoiceStatus.PENDING, SubscriptionInvoiceStatus.FAILED]),
      supabaseAdmin
        .from("assinatura_faturas")
        .select("id, valor, status, data_pagamento, created_at")
        .eq("status", SubscriptionInvoiceStatus.PAID)
        .or(`data_pagamento.gte.${primeiroDiaMesIso},created_at.gte.${primeiroDiaMesIso}`),
    ]);
  },
};
