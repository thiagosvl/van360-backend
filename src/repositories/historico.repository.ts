import { supabaseAdmin } from "../config/supabase.js";
import { AtividadeEntidadeTipo, CobrancaStatus } from "../types/enums.js";

export const historicoRepository = {
    async insert(data: Record<string, unknown>) {
        return supabaseAdmin
            .from('historico_atividades')
            .insert([data]);
    },

    async insertBulk(dataArray: Record<string, unknown>[]) {
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
            .select('id, usuario_id, entidade_tipo, entidade_id, acao, descricao, created_at')
            .eq('usuario_id', usuarioId)
            .order('created_at', { ascending: true })
            .limit(limit);
    },

    async deleteFalhaIntegracaoByEntidadeId(entidadeId: string) {
        return supabaseAdmin
            .from('historico_atividades')
            .delete()
            .eq('entidade_tipo', AtividadeEntidadeTipo.COBRANCA)
            .eq('entidade_id', entidadeId)
            .or('descricao.ilike.Falha na integração ao gerar cobrança%,descricao.ilike.Falha ao gerar Pix da cobrança%');
    },

    async deleteFalhasIntegracaoCobrancasResolvidas() {
        const { data: logsFalha } = await supabaseAdmin
            .from('historico_atividades')
            .select('id, entidade_id')
            .eq('entidade_tipo', AtividadeEntidadeTipo.COBRANCA)
            .or('descricao.ilike.Falha na integração ao gerar cobrança%,descricao.ilike.Falha ao gerar Pix da cobrança%')
            .limit(200);

        if (!logsFalha || logsFalha.length === 0) return;

        const cobrancaIds = Array.from(
            new Set(logsFalha.map((l) => l.entidade_id).filter((id): id is string => Boolean(id)))
        );
        if (cobrancaIds.length === 0) return;

        const { data: cobrancas } = await supabaseAdmin
            .from('cobrancas')
            .select('id, status, pix_copia_cola, boleto_linha_digitavel')
            .in('id', cobrancaIds);

        const resolvedCobrancaIds = new Set(
            (cobrancas || [])
                .filter(
                    (c) =>
                        c.status === CobrancaStatus.PAGO ||
                        c.status === CobrancaStatus.CANCELADA ||
                        Boolean(c.pix_copia_cola) ||
                        Boolean(c.boleto_linha_digitavel)
                )
                .map((c) => c.id)
        );

        const logIdsToDelete = logsFalha
            .filter((l) => l.entidade_id && resolvedCobrancaIds.has(l.entidade_id))
            .map((l) => l.id);

        if (logIdsToDelete.length > 0) {
            await supabaseAdmin
                .from('historico_atividades')
                .delete()
                .in('id', logIdsToDelete);
        }
    }
};
