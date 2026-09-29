import { supabaseAdmin } from "../../config/supabase.js";
import { logger } from "../../config/logger.js";

export interface LogsCleanupResult {
  tentativas_login_removidas: number;
  fila_notificacoes_removidas: number;
  historico_atividades_removidas: number;
}

export const logsCleanupJob = {
  async run(diasLogin = 30, diasFila = 30, diasAtividades = 45): Promise<LogsCleanupResult> {
    logger.info({ diasLogin, diasFila, diasAtividades }, "[LogsCleanupJob] Iniciando expurgo de logs antigos...");

    const { data, error } = await (supabaseAdmin.rpc as unknown as (
      fn: string,
      args: { p_dias_login: number; p_dias_fila: number; p_dias_atividades: number }
    ) => Promise<{ data: LogsCleanupResult | null; error: Error | null }>)(
      "fn_limpar_logs_antigos",
      {
        p_dias_login: diasLogin,
        p_dias_fila: diasFila,
        p_dias_atividades: diasAtividades,
      }
    );

    if (error) {
      logger.error({ error }, "[LogsCleanupJob] Falha ao executar expurgo de logs.");
      throw error;
    }

    const result: LogsCleanupResult = data ?? {
      tentativas_login_removidas: 0,
      fila_notificacoes_removidas: 0,
      historico_atividades_removidas: 0,
    };

    logger.info({ stats: result }, "[LogsCleanupJob] Expurgo de logs concluído com sucesso.");
    return result;
  },
};
