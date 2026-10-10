import { supabaseAdmin } from "../config/supabase.js";
import { IndicacaoStatus } from "../types/enums.js";
import { toStartOfDayISO, toEndOfDayISO } from "../utils/date.utils.js";

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
    },

    async listAllReferrals(params: {
        from: number;
        to: number;
        searchUserIds?: string[];
        status?: IndicacaoStatus;
        data_inicio?: string;
        data_fim?: string;
    }) {
        let q = supabaseAdmin
            .from("indicacoes")
            .select(`
                id,
                status,
                created_at,
                updated_at,
                fatura_origem_id,
                indicador:indicador_id (
                    id,
                    nome,
                    telefone,
                    email,
                    logo_url
                ),
                indicado:indicado_id (
                    id,
                    nome,
                    telefone,
                    email,
                    logo_url,
                    assinaturas (
                        id,
                        status,
                        data_vencimento,
                        trial_ends_at,
                        created_at
                    )
                )
            `, { count: "exact" });

        if (params.status) {
            q = q.eq("status", params.status);
        }

        if (params.data_inicio) {
            q = q.gte("created_at", toStartOfDayISO(params.data_inicio));
        }

        if (params.data_fim) {
            q = q.lte("created_at", toEndOfDayISO(params.data_fim));
        }

        if (params.searchUserIds && params.searchUserIds.length > 0) {
            const idsList = params.searchUserIds.join(",");
            q = q.or(`indicador_id.in.(${idsList}),indicado_id.in.(${idsList})`);
        }

        return q
            .order("created_at", { ascending: false })
            .range(params.from, params.to);
    },

    async getReferralGlobalStats() {
        const { data, error } = await supabaseAdmin
            .from("indicacoes")
            .select("id, status");

        if (error || !data) {
            return {
                total: 0,
                concluidas: 0,
                pendentes: 0,
                taxaConversao: 0,
                diasBonusConcedidos: 0,
            };
        }

        const total = data.length;
        const concluidas = data.filter((i) => i.status === IndicacaoStatus.COMPLETED).length;
        const pendentes = data.filter((i) => i.status === IndicacaoStatus.PENDING).length;
        const taxaConversao = total > 0 ? Math.round((concluidas / total) * 100) : 0;
        const diasBonusConcedidos = concluidas * 30;

        return {
            total,
            concluidas,
            pendentes,
            taxaConversao,
            diasBonusConcedidos,
        };
    }
};

