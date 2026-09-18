import { logger } from "../config/logger.js";
import { historicoRepository } from "../repositories/historico.repository.js";
import { AtividadeAcao, AtividadeEntidadeTipo, DispositivoCadastro } from "../types/enums.js";
import { getContextIp } from "../utils/context.js";
import { RegistrarEventoInput } from "../schemas/telemetria.schema.js";

interface LogAtividadeParams {
    usuario_id: string;
    entidade_tipo: AtividadeEntidadeTipo;
    entidade_id: string;
    acao: AtividadeAcao;
    descricao: string;
    meta?: Record<string, unknown>;
    ip_address?: string;
}

function resolveDescricaoTelemetria(acao: AtividadeAcao, meta?: Record<string, unknown>): string {
    if (acao === AtividadeAcao.APP_ABERTO) {
        const disp = meta?.dispositivo as DispositivoCadastro | undefined;
        switch (disp) {
            case DispositivoCadastro.APP_ANDROID:
                return "Acesso registrado via App Android.";
            case DispositivoCadastro.APP_IOS:
                return "Acesso registrado via App Iphone (iOS).";
            case DispositivoCadastro.WEB_DESKTOP:
                return "Acesso registrado via navegador (computador).";
            case DispositivoCadastro.WEB_MOBILE_ANDROID:
            case DispositivoCadastro.WEB_MOBILE_IOS:
                return "Acesso registrado via navegador (celular).";
            default:
                return "Acesso ao sistema registrado.";
        }
    }

    return `Ação de telemetria registrada: ${acao}`;
}

export const historicoService = {
    async registrarEventoTelemetria(usuarioId: string, payload: RegistrarEventoInput): Promise<void> {
        const entidadeTipo = payload.entidade_tipo || AtividadeEntidadeTipo.USUARIO;
        const entidadeId = payload.entidade_id || usuarioId;
        const descricao = payload.descricao || resolveDescricaoTelemetria(payload.acao, payload.meta);

        await this.log({
            usuario_id: usuarioId,
            entidade_tipo: entidadeTipo,
            entidade_id: entidadeId,
            acao: payload.acao,
            descricao,
            meta: payload.meta || {},
        });
    },

    /**
     * Registra uma nova atividade no log de auditoria.
     */
    async log(params: LogAtividadeParams): Promise<void> {
        try {
            const contextIp = getContextIp();
            const { error } = await historicoRepository.insert({
                usuario_id: params.usuario_id,
                entidade_tipo: params.entidade_tipo,
                entidade_id: params.entidade_id,
                acao: params.acao,
                descricao: params.descricao,
                meta: params.meta || {},
                ip_address: params.ip_address || contextIp || null
            });

            if (error) {
                logger.error({ error, params }, "[historicoService.log] Erro ao inserir log de atividade");
            }
        } catch (err) {
            logger.error({ err, params }, "[historicoService.log] Erro inesperado ao registrar atividade");
        }
    },

    async bulkLog(logs: LogAtividadeParams[]): Promise<void> {
        if (logs.length === 0) return;
        try {
            const contextIp = getContextIp();
            const dataToInsert = logs.map(params => ({
                usuario_id: params.usuario_id,
                entidade_tipo: params.entidade_tipo,
                entidade_id: params.entidade_id,
                acao: params.acao,
                descricao: params.descricao,
                meta: params.meta || {},
                ip_address: params.ip_address || contextIp || null
            }));

            const { error } = await historicoRepository.insertBulk(dataToInsert);

            if (error) {
                logger.error({ error }, "[historicoService.bulkLog] Erro ao inserir logs de atividade em lote");
            }
        } catch (err) {
            logger.error({ err }, "[historicoService.bulkLog] Erro inesperado ao registrar atividades em lote");
        }
    },

    /**
     * Lista atividades de uma entidade específica.
     */
    async listByEntidade(tipo: AtividadeEntidadeTipo, id: string) {
        const { data, error } = await historicoRepository.listByEntidade(tipo, id);

        if (error) throw error;
        return data || [];
    },

    /**
     * Lista atividades globais de um usuário (motorista).
     */
    async listByUsuario(usuarioId: string, limit = 50) {
        const { data, error } = await historicoRepository.listByUsuario(usuarioId, limit);

        if (error) throw error;
        return data || [];
    }
};
