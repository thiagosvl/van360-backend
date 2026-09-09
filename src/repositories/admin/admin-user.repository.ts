import { supabaseAdmin } from "../../config/supabase.js";
import { UserType, SubscriptionInvoiceStatus, SubscriptionStatus, SUBSCRIPTION_VITALICIO_FILTER } from "../../types/enums.js";

export const adminUserRepository = {
  async getDashboardStats() {
    return Promise.all([
      supabaseAdmin
        .from("usuarios")
        .select("id, ativo", { count: "exact", head: true })
        .eq("tipo", UserType.MOTORISTA),
      supabaseAdmin
        .from("passageiros")
        .select("id", { count: "exact", head: true })
        .eq("ativo", true),
      supabaseAdmin
        .from("assinaturas")
        .select("status, data_vencimento"),
      supabaseAdmin
        .from("assinatura_faturas")
        .select("valor, status")
        .eq("status", SubscriptionInvoiceStatus.PAID),
      supabaseAdmin
        .from("usuarios")
        .select("id, nome, email, telefone, created_at, tipo, assinaturas(status, data_vencimento)")
        .eq("tipo", UserType.MOTORISTA)
        .order("created_at", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("usuarios")
        .select("canal_aquisicao, dispositivo_cadastro")
        .eq("tipo", UserType.MOTORISTA),
      supabaseAdmin
        .from("contratos")
        .select("id, status, valor_total"),
      supabaseAdmin
        .from("usuarios")
        .select("config_contrato, assinatura_digital_url")
        .eq("tipo", UserType.MOTORISTA),
      supabaseAdmin
        .from("indicacoes")
        .select("id, status, indicador_id, indicado_id"),
    ]);
  },

  async listUsers(query: {
    from: number;
    to: number;
    searchClean?: string;
    isId?: boolean;
    digits?: string;
    status?: string;
  }) {
    const isFilteredByStatus = Boolean(query.status);
    const assinaturasRelation = isFilteredByStatus ? "assinaturas!inner" : "assinaturas";

    let q = supabaseAdmin
      .from("usuarios")
      .select(
        `id, nome, apelido, email, cpfcnpj, telefone, ativo, tipo, created_at, data_nascimento, canal_aquisicao, dispositivo_cadastro, ${assinaturasRelation}(id, status, plano_id, data_vencimento, trial_ends_at, planos(id, nome, identificador))`,
        { count: "exact" }
      )
      .eq("tipo", UserType.MOTORISTA)
      .order("created_at", { ascending: false });

    if (query.status === SUBSCRIPTION_VITALICIO_FILTER) {
      q = q
        .eq("assinaturas.status", SubscriptionStatus.ACTIVE)
        .is("assinaturas.data_vencimento", null);
    } else if (query.status === SubscriptionStatus.ACTIVE) {
      q = q
        .eq("assinaturas.status", SubscriptionStatus.ACTIVE)
        .not("assinaturas.data_vencimento", "is", null);
    } else if (query.status) {
      q = q.eq("assinaturas.status", query.status);
    }

    if (query.isId && query.searchClean) {
      q = q.eq("id", query.searchClean);
    } else if (query.searchClean) {
      if (query.digits && query.digits.length >= 3) {
        q = q.or(`nome.ilike.%${query.searchClean}%,telefone.ilike.%${query.digits}%`);
      } else {
        q = q.or(`nome.ilike.%${query.searchClean}%`);
      }
    }

    return q.range(query.from, query.to);
  },

  async getUserDetails(userId: string) {
    return Promise.all([
      supabaseAdmin
        .from("usuarios")
        .select("*")
        .eq("id", userId)
        .single(),
      supabaseAdmin
        .from("assinaturas")
        .select("*, planos(*)")
        .eq("usuario_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("assinatura_faturas")
        .select("*, planos(nome, identificador)")
        .eq("usuario_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("planos")
        .select("id, nome, identificador, valor, valor_promocional, ativo")
        .eq("ativo", true)
        .order("valor", { ascending: true }),
      supabaseAdmin
        .from("veiculos")
        .select("id", { count: "exact", head: true })
        .eq("usuario_id", userId),
      supabaseAdmin
        .from("escolas")
        .select("id", { count: "exact", head: true })
        .eq("usuario_id", userId),
      supabaseAdmin
        .from("passageiros")
        .select("id", { count: "exact", head: true })
        .eq("usuario_id", userId),
      supabaseAdmin
        .from("pre_passageiros")
        .select("id", { count: "exact", head: true })
        .eq("usuario_id", userId),
      supabaseAdmin
        .from("contratos")
        .select(
          "id, usuario_id, passageiro_id, status, provider, valor_total, valor_parcela, qtd_parcelas, minuta_url, contrato_final_url, created_at, assinado_em, passageiros(id, nome, responsaveis:passageiro_responsaveis(tipo, parentesco, responsavel:responsaveis(id, nome, cpf, telefone, email)))"
        )
        .eq("usuario_id", userId)
        .order("created_at", { ascending: false }),
    ]);
  },

  async getSubscriptionForUser(userId: string) {
    return supabaseAdmin
      .from("assinaturas")
      .select("id, status, plano_id")
      .eq("usuario_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  },

  async updateSubscription(id: string, data: Record<string, unknown>) {
    return supabaseAdmin
      .from("assinaturas")
      .update(data)
      .eq("id", id);
  },

  async getUsersLatestActivity(params: {
    search?: string;
    sort: "inactive_first" | "recent_first";
    limit: number;
    offset: number;
  }) {
    return supabaseAdmin.rpc("get_motoristas_latest_activity", {
      p_search: params.search || null,
      p_sort: params.sort,
      p_limit: params.limit,
      p_offset: params.offset,
    });
  },
};

