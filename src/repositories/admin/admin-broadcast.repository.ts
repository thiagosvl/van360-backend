import { supabaseAdmin } from "../../config/supabase.js";
import { UserType, SubscriptionStatus, SUBSCRIPTION_VITALICIO_FILTER } from "../../types/enums.js";

export interface EligibleDriverResult {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  statusAssinatura: string;
  tokens: string[];
}


export interface GetEligibleDriversParams {
  statusList?: string[];
  driverIds?: string[];
}

interface UsuarioComAssinaturas {
  id: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  ativo: boolean;
  assinaturas: Array<{
    id: string;
    status: string;
    data_vencimento: string | null;
  }> | null;
}

export const adminBroadcastRepository = {
  async getEligibleDrivers(params: GetEligibleDriversParams): Promise<EligibleDriverResult[]> {
    const { statusList, driverIds } = params;

    if (driverIds && driverIds.length > 0) {
      const { data: users, error } = await supabaseAdmin
        .from("usuarios")
        .select("id, nome, email, telefone, ativo, assinaturas(id, status, data_vencimento)")
        .eq("tipo", UserType.MOTORISTA)
        .in("id", driverIds);

      if (error || !users) {
        throw error || new Error("Erro ao buscar motoristas selecionados.");
      }

      const typedUsers = users as unknown as UsuarioComAssinaturas[];
      const userIds = typedUsers.map((u) => u.id);

      const { data: tokenRows } = await supabaseAdmin
        .from("usuario_push_tokens")
        .select("user_id, token")
        .in("user_id", userIds);

      const tokensByUserId = new Map<string, string[]>();
      if (tokenRows) {
        for (const row of tokenRows) {
          if (!row.token) continue;
          const current = tokensByUserId.get(row.user_id) || [];
          current.push(row.token);
          tokensByUserId.set(row.user_id, current);
        }
      }

      return typedUsers.map((u) => {
        const sub = u.assinaturas?.[0];
        let statusAssinatura = "SEM_ASSINATURA";
        if (sub) {
          if (sub.status === SubscriptionStatus.ACTIVE && !sub.data_vencimento) {
            statusAssinatura = "VITALICIO";
          } else {
            statusAssinatura = sub.status;
          }
        }

        return {
          id: u.id,
          nome: u.nome || "Motorista",
          email: u.email || "",
          telefone: u.telefone || "",
          statusAssinatura,
          tokens: tokensByUserId.get(u.id) || [],
        };
      });
    }

    const statuses = statusList && statusList.length > 0 ? statusList : ["TODOS"];
    const isTodos = statuses.includes("TODOS");
    const includesVitalicio = statuses.includes(SUBSCRIPTION_VITALICIO_FILTER) || statuses.includes("VITALICIO");
    const standardStatuses = statuses.filter(
      (s) => s !== "TODOS" && s !== SUBSCRIPTION_VITALICIO_FILTER && s !== "VITALICIO"
    );

    const { data: users, error } = await supabaseAdmin
      .from("usuarios")
      .select("id, nome, email, telefone, ativo, assinaturas(id, status, data_vencimento)")
      .eq("tipo", UserType.MOTORISTA)
      .eq("ativo", true);

    if (error || !users) {
      throw error || new Error("Erro ao buscar motoristas elegíveis.");
    }

    const typedUsers = users as unknown as UsuarioComAssinaturas[];

    const filteredUsers = typedUsers.filter((u) => {
      if (isTodos) return true;

      const assinaturas = u.assinaturas || [];
      if (assinaturas.length === 0) {
        return standardStatuses.includes("SEM_ASSINATURA");
      }

      const activeSub = assinaturas[0];
      if (!activeSub) return false;

      if (includesVitalicio && activeSub.status === SubscriptionStatus.ACTIVE && !activeSub.data_vencimento) {
        return true;
      }

      if (standardStatuses.includes(activeSub.status)) {
        if (activeSub.status === SubscriptionStatus.ACTIVE && activeSub.data_vencimento) {
          return true;
        }
        return activeSub.status !== SubscriptionStatus.ACTIVE;
      }

      return false;
    });

    if (filteredUsers.length === 0) {
      return [];
    }

    const userIds = filteredUsers.map((u) => u.id);
    const { data: tokenRows } = await supabaseAdmin
      .from("usuario_push_tokens")
      .select("user_id, token")
      .in("user_id", userIds);

    const tokensByUserId = new Map<string, string[]>();
    if (tokenRows) {
      for (const row of tokenRows) {
        if (!row.token) continue;
        const current = tokensByUserId.get(row.user_id) || [];
        current.push(row.token);
        tokensByUserId.set(row.user_id, current);
      }
    }

    return filteredUsers.map((u) => {
      const sub = u.assinaturas?.[0];
      let statusAssinatura = "SEM_ASSINATURA";
      if (sub) {
        if (sub.status === SubscriptionStatus.ACTIVE && !sub.data_vencimento) {
          statusAssinatura = "VITALICIO";
        } else {
          statusAssinatura = sub.status;
        }
      }

      return {
        id: u.id,
        nome: u.nome || "Motorista",
        email: u.email || "",
        telefone: u.telefone || "",
        statusAssinatura,
        tokens: tokensByUserId.get(u.id) || [],
      };
    });
  },


  async logNotificationsInQueue(
    items: Array<{
      usuario_id: string;
      destinatario: string;
      status: string;
      payload: Record<string, unknown>;
      erro_mensagem?: string | null;
      provider_message_id?: string | null;
    }>
  ): Promise<void> {
    if (items.length === 0) return;

    const rows = items.map((item) => ({
      usuario_id: item.usuario_id,
      canal: "FIREBASE",
      evento: "MOTORISTA_COMUNICADO_GERAL",
      destinatario: item.destinatario,
      status: item.status,
      payload: item.payload,
      erro_mensagem: item.erro_mensagem || null,
      provider_message_id: item.provider_message_id || null,
      tentativas: 1,
      max_tentativas: 1,
      proxima_tentativa_em: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const CHUNK_SIZE = 100;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      await supabaseAdmin.from("fila_notificacoes").insert(chunk);
    }
  },
};
