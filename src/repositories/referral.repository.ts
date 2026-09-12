import { supabaseAdmin } from "../config/supabase.js";
import { IndicacaoStatus } from "../types/enums.js";

export interface IndicadorReferralDTO {
    id: string;
    nome: string;
    telefone: string;
    email: string;
    cpfcnpj?: string | null;
}

export interface IndicadoReferralDTO {
    id: string;
    nome: string;
    telefone: string;
    email: string;
}

export interface ReferralWithIndicadorRow {
    id: string;
    status: IndicacaoStatus;
    created_at: string;
    fatura_origem_id: string | null;
    indicador: IndicadorReferralDTO | null;
}

export interface ReferredUserRow {
    id: string;
    status: IndicacaoStatus;
    created_at: string;
    indicado: IndicadoReferralDTO | null;
}

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
    },

    async getReferralWithIndicador(indicadoId: string) {
        return supabaseAdmin
            .from("indicacoes")
            .select(`
                id,
                status,
                created_at,
                fatura_origem_id,
                indicador:indicador_id (
                    id,
                    nome,
                    telefone,
                    email,
                    cpfcnpj
                )
            `)
            .eq("indicado_id", indicadoId)
            .maybeSingle();
    },

    async updateReferralIndicador(indicadoId: string, novoIndicadorId: string) {
        return supabaseAdmin
            .from("indicacoes")
            .update({ indicador_id: novoIndicadorId, updated_at: new Date().toISOString() })
            .eq("indicado_id", indicadoId);
    },

    async deleteReferralByIndicadoId(indicadoId: string) {
        return supabaseAdmin
            .from("indicacoes")
            .delete()
            .eq("indicado_id", indicadoId);
    },

    async getReferredUsersByIndicadorId(indicadorId: string) {
        return supabaseAdmin
            .from("indicacoes")
            .select(`
                id,
                status,
                created_at,
                indicado:indicado_id (
                    id,
                    nome,
                    telefone,
                    email
                )
            `)
            .eq("indicador_id", indicadorId)
            .order("created_at", { ascending: false });
    },

    async nullifyFaturaOrigem(faturaId: string) {
        return supabaseAdmin
            .from("indicacoes")
            .update({ fatura_origem_id: null })
            .eq("fatura_origem_id", faturaId);
    }
};

