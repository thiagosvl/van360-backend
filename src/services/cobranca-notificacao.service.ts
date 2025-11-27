import { supabaseAdmin } from "../config/supabase";

export const cobrancaNotificacaoService = {
    async listByCobrancaId(cobrancaId: string) {
        if (!cobrancaId) throw new Error("ID da cobrança é obrigatório");

        const { data, error } = await supabaseAdmin
            .from('cobranca_notificacoes')
            .select('*')
            .eq('cobranca_id', cobrancaId)
            .order('data_envio', { ascending: false });

        if (error) throw error;
        return data || [];
    },

    async create(cobrancaId: string, payload: { tipo_origem: string; tipo_evento: string; canal: string; }) {
        if (!cobrancaId) throw new Error("ID da cobrança é obrigatório");

        const { error } = await supabaseAdmin
            .from('cobranca_notificacoes')
            .insert([payload]);

        if (error) throw error;
        return true;
    }
};
