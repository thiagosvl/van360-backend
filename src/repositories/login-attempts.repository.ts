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
  }, from?: number, to?: number): Promise<{ data: LoginAttempt[] | null; count: number | null; error: any }> {
    let query = supabaseAdmin
      .from("tentativas_login")
      .select("*", { count: "exact" })
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
      const cleanSearch = filters.search_cpf.trim();
      const digits = cleanSearch.replace(/\D/g, "");
      const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanSearch);

      let loginTerms: string[] = [cleanSearch];

      let userQuery = supabaseAdmin.from("usuarios").select("cpfcnpj, email");
      let doUserQuery = false;

      if (isId) {
          userQuery = userQuery.eq("id", cleanSearch);
          doUserQuery = true;
      } else {
          if (digits && digits.length >= 3) {
              userQuery = userQuery.or(`cpfcnpj.ilike.%${digits}%,telefone.ilike.%${digits}%`);
              doUserQuery = true;
          } else if (cleanSearch) {
              userQuery = userQuery.or(`nome.ilike.%${cleanSearch}%`);
              doUserQuery = true;
          }
      }

      if (doUserQuery) {
          const { data: uData } = await userQuery.limit(50);
          if (uData && uData.length > 0) {
              uData.forEach((u: any) => {
                  if (u.cpfcnpj) loginTerms.push(u.cpfcnpj);
                  if (u.email) loginTerms.push(u.email);
              });
          }
      }

      const orConditions = loginTerms.map(term => `login_tentado.ilike.%${term}%`).join(',');
      query = query.or(orConditions);
    }

    if (from !== undefined && to !== undefined) {
      query = query.range(from, to);
    } else {
      query = query.limit(200);
    }

    return query;
  }
}

export const loginAttemptsRepository = new LoginAttemptsRepository();
