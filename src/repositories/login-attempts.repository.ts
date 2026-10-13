import { supabaseAdmin } from "../config/supabase.js";
import { logger } from "../config/logger.js";
import { isValidFilterValue } from "../utils/filter.utils.js";
import { toStartOfDayISO, toEndOfDayISO } from "../utils/date.utils.js";
import { PostgrestError } from "@supabase/supabase-js";

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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ error: msg }, "Falha inesperada ao registrar tentativa de login.");
    }
  }

  async listAttempts(filters?: {
    data_inicio?: string;
    data_fim?: string;
    search_cpf?: string;
  }, from?: number, to?: number): Promise<{ data: LoginAttempt[] | null; count: number | null; error: PostgrestError | null }> {
    let query = supabaseAdmin
      .from("tentativas_login")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (isValidFilterValue(filters?.data_inicio)) {
      query = query.gte("created_at", toStartOfDayISO(filters!.data_inicio));
    }
    
    if (isValidFilterValue(filters?.data_fim)) {
      query = query.lte("created_at", toEndOfDayISO(filters!.data_fim));
    }
    
    if (isValidFilterValue(filters?.search_cpf)) {
      const rawSearch = filters!.search_cpf.trim();
      const sanitizedText = rawSearch.replace(/[,()"\\]/g, " ").replace(/\s+/g, " ").trim();
      const digits = rawSearch.replace(/\D/g, "");
      const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sanitizedText);

      const loginTerms: string[] = [];
      if (sanitizedText) loginTerms.push(sanitizedText);
      if (digits && digits.length >= 3 && !loginTerms.includes(digits)) loginTerms.push(digits);

      let userQuery = supabaseAdmin.from("usuarios").select("cpfcnpj, email");
      let doUserQuery = false;

      if (isId) {
        userQuery = userQuery.eq("id", sanitizedText);
        doUserQuery = true;
      } else {
        if (digits && digits.length >= 3) {
          userQuery = userQuery.or(`cpfcnpj.ilike.%${digits}%,telefone.ilike.%${digits}%`);
          doUserQuery = true;
        } else if (sanitizedText) {
          userQuery = userQuery.or(`nome.ilike.%${sanitizedText}%`);
          doUserQuery = true;
        }
      }

      if (doUserQuery) {
        const { data: uData } = await userQuery.limit(50);
        if (uData && uData.length > 0) {
          uData.forEach((u: { cpfcnpj?: string | null; email?: string | null }) => {
            if (u.cpfcnpj && !loginTerms.includes(u.cpfcnpj)) loginTerms.push(u.cpfcnpj);
            if (u.email && !loginTerms.includes(u.email)) loginTerms.push(u.email);
          });
        }
      }

      if (loginTerms.length > 0) {
        const orConditions = loginTerms
          .map(term => term.replace(/[,()"\\]/g, "").trim())
          .filter(Boolean)
          .map(term => `login_tentado.ilike.%${term}%`)
          .join(",");
        if (orConditions) {
          query = query.or(orConditions);
        }
      }
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
