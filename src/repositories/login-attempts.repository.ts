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

export interface LoginAttempt extends LoginAttemptPayload {
  id: string;
  created_at: string;
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

  async listAttempts(filters?: {
    data_inicio?: string;
    data_fim?: string;
    search_cpf?: string;
  }): Promise<{ data: LoginAttempt[] | null; error: any }> {
    let query = supabaseAdmin
      .from("tentativas_login")
      .select("*")
      .order("created_at", { ascending: false });

    if (filters?.data_inicio) {
      const inicio = filters.data_inicio.length === 10 ? `${filters.data_inicio}T00:00:00.000-03:00` : filters.data_inicio;
      query = query.gte("created_at", inicio);
    }
    
    if (filters?.data_fim) {
      const fim = filters.data_fim.length === 10 ? `${filters.data_fim}T23:59:59.999-03:00` : filters.data_fim;
      query = query.lte("created_at", fim);
    }
    
    if (filters?.search_cpf) {
      query = query.ilike("login_tentado", `%${filters.search_cpf}%`);
    }

    // Limitando a 200 para evitar queries gigantes no painel admin
    query = query.limit(200);

    return query;
  }
}

export const loginAttemptsRepository = new LoginAttemptsRepository();
