import { supabaseAdmin } from "../../config/supabase.js";
import { UserType, SubscriptionInvoiceStatus } from "../../types/enums.js";

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
        .select("canal_aquisicao")
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

  async listUsers(query: { from: number; to: number; searchClean?: string; isId?: boolean; digits?: string }) {
    let q = supabaseAdmin
      .from("usuarios")
      .select(
        "id, nome, apelido, email, cpfcnpj, telefone, ativo, tipo, created_at, data_nascimento, assinaturas(id, status, plano_id, data_vencimento, trial_ends_at, planos(id, nome, identificador))",
        { count: "exact" }
      )
      .eq("tipo", UserType.MOTORISTA)
      .order("created_at", { ascending: false })
      .range(query.from, query.to);

    if (query.isId && query.searchClean) {
      q = q.eq("id", query.searchClean);
    } else if (query.searchClean) {
      if (query.digits && query.digits.length >= 3) {
        q = q.or(`nome.ilike.%${query.searchClean}%,telefone.ilike.%${query.digits}%`);
      } else {
        q = q.or(`nome.ilike.%${query.searchClean}%`);
      }
    }
    return q;
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
        .select("*, passageiros(id, nome, cpf_responsavel, nome_responsavel, telefone_responsavel)")
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
};
