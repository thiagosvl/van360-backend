import { supabaseAdmin } from "../config/supabase.js";

export const authRepository = {
    async checkUserStatus(cpfcnpj: string, email: string, telefone: string) {
        return supabaseAdmin
            .from("usuarios")
            .select("id, ativo, cpfcnpj, email, telefone")
            .or(`cpfcnpj.eq.${cpfcnpj},email.eq.${email},telefone.eq.${telefone}`)
            .limit(1);
    },

    async getUserLogin(cpfcnpj: string) {
        return supabaseAdmin
            .from("usuarios")
            .select("id, email, ativo")
            .eq("cpfcnpj", cpfcnpj)
            .single();
    },

    async getPassageiroResponsavel(cpf: string, email: string) {
        return supabaseAdmin
            .from("passageiros")
            .select("usuario_id")
            .eq("cpf_responsavel", cpf)
            .eq("email_responsavel", email)
            .limit(1)
            .single();
    },

    async listPassageirosResponsavel(cpf: string, email: string, usuarioId: string) {
        return supabaseAdmin
            .from("passageiros")
            .select("*, escolas(nome), veiculos(placa)")
            .eq("cpf_responsavel", cpf)
            .eq("email_responsavel", email)
            .eq("usuario_id", usuarioId)
            .order("nome", { ascending: true });
    },

    async getUserIdAndEmailByCpf(cpf: string) {
        return supabaseAdmin
            .from("usuarios")
            .select("id, email, nome, telefone")
            .eq("cpfcnpj", cpf)
            .single();
    },

    async getUserByEmail(email: string) {
        return supabaseAdmin
            .from("usuarios")
            .select("id")
            .eq("email", email)
            .single();
    },

    async invalidateRecoveryCodes(userId: string) {
        return supabaseAdmin
            .from("recuperacoes_senha")
            .update({ usado: true })
            .eq("usuario_id", userId)
            .eq("usado", false);
    },

    async insertRecoveryCode(userId: string, codigo: string, expiraEm: string) {
        return supabaseAdmin
            .from("recuperacoes_senha")
            .insert([{
                usuario_id: userId,
                codigo: codigo,
                expira_em: expiraEm
            }]);
    },

    async getRecoveryCode(userId: string, codigo: string) {
        return supabaseAdmin
            .from("recuperacoes_senha")
            .select("id, expira_em, usado")
            .eq("usuario_id", userId)
            .eq("codigo", codigo)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
    },

    async markRecoveryCodeUsed(id: string) {
        return supabaseAdmin
            .from("recuperacoes_senha")
            .update({ usado: true })
            .eq("id", id);
    },

    async getRecoverySession(recoveryId: string) {
        return supabaseAdmin
            .from("recuperacoes_senha")
            .select("usuario_id, created_at, usado, usuarios(email, nome, telefone)")
            .eq("id", recoveryId)
            .single();
    },

    async getAuthProfile(userId: string) {
        return supabaseAdmin
            .from("usuarios")
            .select("id, ativo, tipo")
            .eq("id", userId)
            .maybeSingle();
    }
};
