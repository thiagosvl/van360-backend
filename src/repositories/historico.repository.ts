import { supabaseAdmin } from "../config/supabase.js";
import { AtividadeEntidadeTipo } from "../types/enums.js";

export const historicoRepository = {
    async insert(data: any) {
        return supabaseAdmin
            .from('historico_atividades')
            .insert([data]);
    },

    async insertBulk(dataArray: any[]) {
        if (dataArray.length === 0) return { data: null, error: null };
        return supabaseAdmin
            .from('historico_atividades')
            .insert(dataArray);
    },

    async listByEntidade(tipo: AtividadeEntidadeTipo, id: string) {
        return supabaseAdmin
            .from('historico_atividades')
            .select('*')
            .eq('entidade_tipo', tipo)
            .eq('entidade_id', id)
            .order('created_at', { ascending: true });
    },

    async listByUsuario(usuarioId: string, limit: number) {
        return supabaseAdmin
            .from('historico_atividades')
            .select('*')
            .eq('usuario_id', usuarioId)
            .order('created_at', { ascending: true })
            .limit(limit);
    }
};
