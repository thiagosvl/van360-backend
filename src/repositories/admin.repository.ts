import { supabaseAdmin } from "../config/supabase.js";
import { UserType } from "../types/enums.js";

export const adminRepository = {
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
                .select("status"),
            supabaseAdmin
                .from("assinatura_faturas")
                .select("valor, status")
                .eq("status", "PAID"),
            supabaseAdmin
                .from("usuarios")
                .select("id, nome, email, telefone, created_at, tipo, assinaturas(status)")
                .eq("tipo", UserType.MOTORISTA)
                .order("created_at", { ascending: false })
                .limit(10),
        ]);
    },

    async listUsers(query: any) {
        let q = supabaseAdmin
            .from("usuarios")
            .select("id, nome, apelido, email, cpfcnpj, telefone, ativo, tipo, created_at, data_nascimento, assinaturas(id, status, plano_id, data_vencimento, trial_ends_at, planos(id, nome, identificador))", { count: "exact" })
            .eq("tipo", UserType.MOTORISTA)
            .order("created_at", { ascending: false })
            .range(query.from, query.to);

        if (query.searchClean) {
            if (query.digits && query.digits.length >= 3) {
                q = q.or(`nome.ilike.%${query.searchClean}%,telefone.ilike.%${query.digits}%`);
            } else {
                q = q.or(`nome.ilike.%${query.searchClean}%`);
            }
        }
        return q;
    },

    async getUserLogs(
        userId: string,
        from: number,
        to: number,
        filters?: { dataInicio?: string; dataFim?: string; acao?: string; entidade?: string }
    ) {
        let query = supabaseAdmin
            .from("historico_atividades")
            .select("*", { count: "exact" })
            .eq("usuario_id", userId);

        if (filters?.dataInicio) {
            query = query.gte("created_at", `${filters.dataInicio}T00:00:00`);
        }
        if (filters?.dataFim) {
            query = query.lte("created_at", `${filters.dataFim}T23:59:59`);
        }
        if (filters?.acao) {
            query = query.eq("acao", filters.acao);
        }
        if (filters?.entidade) {
            query = query.eq("entidade_tipo", filters.entidade);
        }

        return query
            .order("created_at", { ascending: false })
            .range(from, to);
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
                .order("valor", { ascending: true })
        ]);
    },

    async listConfigs() {
        return supabaseAdmin
            .from("configuracao_interna")
            .select("*")
            .order("chave", { ascending: true });
    },

    async updateConfig(chave: string, valor: string) {
        return supabaseAdmin
            .from("configuracao_interna")
            .upsert({ chave, valor }, { onConflict: "chave" });
    },

    async listPlanos() {
        return supabaseAdmin
            .from("planos")
            .select("*")
            .order("valor", { ascending: true });
    },

    async updatePlano(id: string, data: any) {
        return supabaseAdmin
            .from("planos")
            .update(data)
            .eq("id", id);
    },

    async getSubscriptionForUser(userId: string) {
        return supabaseAdmin
            .from("assinaturas")
            .select("id")
            .eq("usuario_id", userId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
    },

    async updateSubscription(id: string, data: any) {
        return supabaseAdmin
            .from("assinaturas")
            .update(data)
            .eq("id", id);
    }
};
