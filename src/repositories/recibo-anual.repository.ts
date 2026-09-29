import { supabaseAdmin } from "../config/supabase.js";
import type { Tables, TablesInsert, TablesUpdate } from "../types/database.types.js";

export type ReciboAnual = Tables<"recibos_anuais">;
export type NovoReciboAnual = TablesInsert<"recibos_anuais">;
export type AtualizarReciboAnual = TablesUpdate<"recibos_anuais">;

export const reciboAnualRepository = {
    async findByPassageiroEAno(passageiroId: string, ano: number) {
        return supabaseAdmin
            .from("recibos_anuais")
            .select("*")
            .eq("passageiro_id", passageiroId)
            .eq("ano", ano)
            .maybeSingle();
    },

    async insert(data: NovoReciboAnual) {
        return supabaseAdmin
            .from("recibos_anuais")
            .insert(data)
            .select()
            .single();
    },

    async update(id: string, data: AtualizarReciboAnual) {
        return supabaseAdmin
            .from("recibos_anuais")
            .update(data)
            .eq("id", id)
            .select()
            .single();
    },

    async deleteByPassageiroEAno(passageiroId: string, ano: number) {
        return supabaseAdmin
            .from("recibos_anuais")
            .delete()
            .eq("passageiro_id", passageiroId)
            .eq("ano", ano)
            .select()
            .maybeSingle();
    }
};
