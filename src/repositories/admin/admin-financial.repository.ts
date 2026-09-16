import { supabaseAdmin } from "../../config/supabase.js";
import { UserType, SubscriptionStatus, SubscriptionInvoiceStatus } from "../../types/enums.js";

export const adminFinancialRepository = {
  async getFinancialRawData() {
    return Promise.all([
      supabaseAdmin
        .from("assinaturas")
        .select(`
          id,
          usuario_id,
          status,
          plano_id,
          data_vencimento,
          trial_ends_at,
          metodo_pagamento,
          valor_base_mensal,
          valor_base_anual,
          valor_promocional_mensal,
          valor_promocional_anual,
          usuarios(id, nome, telefone, email),
          planos(id, nome, identificador, valor, valor_promocional)
        `)
        .in("status", [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL]),

      supabaseAdmin
        .from("assinatura_faturas")
        .select("id, valor, status, metodo_pagamento, data_vencimento, data_pagamento, created_at")
        .eq("status", SubscriptionInvoiceStatus.PAID),

      supabaseAdmin
        .from("assinaturas")
        .select("id, status, usuario_id, data_vencimento, trial_ends_at"),

      supabaseAdmin
        .from("planos")
        .select("id, nome, identificador, valor, valor_promocional"),

      supabaseAdmin
        .from("usuarios")
        .select("id, created_at, assinaturas(id, status, data_vencimento, trial_ends_at)")
        .eq("tipo", UserType.MOTORISTA)
    ]);
  },

  async getDemographicsRawData() {
    return supabaseAdmin
      .from("usuarios")
      .select(`
        id,
        data_nascimento,
        created_at,
        assinaturas(id, status, created_at)
      `)
      .eq("tipo", UserType.MOTORISTA);
  }
};
