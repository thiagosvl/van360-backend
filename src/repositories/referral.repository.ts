import { supabaseAdmin } from "../config/supabase.js";
import { IndicacaoStatus } from "../types/enums.js";

export const referralRepository = {
    async getPendingReferralByIndicadoId(indicadoId: string) {
        return supabaseAdmin
            .from("indicacoes")
            .select("id")
            .eq("indicado_id", indicadoId)
            .eq("status", IndicacaoStatus.PENDING)
            .maybeSingle();
    },

    async getReferralsByIndicadorId(indicadorId: string) {
        return supabaseAdmin
            .from("indicacoes")
            .select("status")
            .eq("indicador_id", indicadorId);
    },

    async getReferralByIndicadoId(indicadoId: string) {
        return supabaseAdmin
            .from("indicacoes")
            .select("id, status")
            .eq("indicado_id", indicadoId)
            .maybeSingle();
    },

    async createReferral(data: { indicador_id: string; indicado_id: string; status: IndicacaoStatus }) {
        return supabaseAdmin
            .from("indicacoes")
            .insert(data);
    },

    async completeReferral(indicadoId: string, faturaId: string) {
        const { data: indicacao, error } = await supabaseAdmin
            .from("indicacoes")
            .select("*")
            .eq("indicado_id", indicadoId)
            .eq("status", IndicacaoStatus.PENDING)
            .single();

        if (error || !indicacao) return { data: null, error };

        const updateRes = await supabaseAdmin
            .from("indicacoes")
            .update({ status: IndicacaoStatus.COMPLETED, fatura_origem_id: faturaId })
            .eq("id", indicacao.id);

        return { data: indicacao, error: updateRes.error };
    }
};
