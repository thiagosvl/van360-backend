import { supabaseAdmin } from "../config/supabase.js";
import { logger } from "../config/logger.js";

export interface LoginAttemptPayload {
  login_tentado: string;
  ip: string | null;
  user_agent: string | null;
  dispositivo: string | null;
  sucesso: boolean;
  motivo_falha: string | null;
}

class LoginAttemptsRepository {
  async logAttempt(payload: LoginAttemptPayload): Promise<void> {
    try {
      const { error } = await supabaseAdmin.from("tentativas_login").insert(payload);
      if (error) {
        logger.error({ error: error.message }, "Erro ao registrar tentativa de login no banco.");
      }
    } catch (err: any) {
      logger.error({ error: err.message }, "Falha inesperada ao registrar tentativa de login.");
    }
  }
}

export const loginAttemptsRepository = new LoginAttemptsRepository();
