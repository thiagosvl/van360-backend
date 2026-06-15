import { supabaseAdmin } from "../config/supabase.js";
import { AtividadeEntidadeTipo } from "../types/enums.js";

export const historicoRepository = {
    async insert(data: any) {
        return supabaseAdmin
            .from('historico_atividades')
            .insert([data]);
    },

    async listByEntidade(tipo: AtividadeEntidadeTipo, id: string) {
        return supabaseAdmin
            .from('historico_atividades')
            .select('*')
            .eq('entidade_tipo', tipo)
            .eq('entidade_id', id)
            .order('created_at', { ascending: false });
    },

    async listByUsuario(usuarioId: string, limit: number) {
        return supabaseAdmin
            .from('historico_atividades')
            .select('*')
            .eq('usuario_id', usuarioId)
            .order('created_at', { ascending: false })
            .limit(limit);
    }
};
