import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { AtividadeAcao, AtividadeEntidadeTipo } from "../types/enums.js";
import { getContextIp } from "../utils/context.js";

interface LogAtividadeParams {
    usuario_id: string;
    entidade_tipo: AtividadeEntidadeTipo;
    entidade_id: string;
    acao: AtividadeAcao;
    descricao: string;
    meta?: Record<string, any>;
    ip_address?: string;
}

export const historicoService = {
    /**
     * Registra uma nova atividade no log de auditoria.
     */
    async log(params: LogAtividadeParams): Promise<void> {
        try {
            const contextIp = getContextIp();
            const { error } = await supabaseAdmin
                .from('historico_atividades')
                .insert([{
                    usuario_id: params.usuario_id,
                    entidade_tipo: params.entidade_tipo,
                    entidade_id: params.entidade_id,
                    acao: params.acao,
                    descricao: params.descricao,
                    meta: params.meta || {},
                    ip_address: params.ip_address || contextIp || null
                }]);

            if (error) {
                logger.error({ error, params }, "[historicoService.log] Erro ao inserir log de atividade");
            }
        } catch (err) {
            logger.error({ err, params }, "[historicoService.log] Erro inesperado ao registrar atividade");
        }
    },

    /**
     * Lista atividades de uma entidade específica.
     */
    async listByEntidade(tipo: AtividadeEntidadeTipo, id: string) {
        const { data, error } = await supabaseAdmin
            .from('historico_atividades')
            .select('*')
            .eq('entidade_tipo', tipo)
            .eq('entidade_id', id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    },

    /**
     * Lista atividades globais de um usuário (motorista).
     */
    async listByUsuario(usuarioId: string, limit = 50) {
        const { data, error } = await supabaseAdmin
            .from('historico_atividades')
            .select('*')
            .eq('usuario_id', usuarioId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    }
};
