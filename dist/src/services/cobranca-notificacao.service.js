import { supabaseAdmin } from "../config/supabase.js";
export const cobrancaNotificacaoService = {
    async listByCobrancaId(cobrancaId) {
        if (!cobrancaId)
            throw new Error("ID da cobrança é obrigatório");
        const { data, error } = await supabaseAdmin
            .from('cobranca_notificacoes')
            .select('*')
            .eq('cobranca_id', cobrancaId)
            .order('data_envio', { ascending: false });
        if (error)
            throw error;
        return data || [];
    },
    async create(cobrancaId, payload) {
        if (!cobrancaId)
            throw new Error("ID da cobrança é obrigatório");
        const { error } = await supabaseAdmin
            .from('cobranca_notificacoes')
            .insert([payload]);
        if (error)
            throw error;
        return true;
    }
};
