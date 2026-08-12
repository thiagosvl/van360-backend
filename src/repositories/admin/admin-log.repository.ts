import { supabaseAdmin } from "../../config/supabase.js";
import { isValidFilterValue } from "../../utils/filter.utils.js";

export const adminLogRepository = {
  async getUserLogs(
    userId: string,
    from: number,
    to: number,
    filters?: { dataInicio?: string; dataFim?: string; acao?: string; entidade?: string }
  ) {
    let query = supabaseAdmin
      .from("historico_atividades")
      .select("*", { count: "exact" })
      .eq("usuario_id", userId);

    if (isValidFilterValue(filters?.dataInicio)) {
      const inicio = filters!.dataInicio.length === 10 ? `${filters!.dataInicio}T00:00:00.000-03:00` : filters!.dataInicio;
      query = query.gte("created_at", inicio);
    }
    if (isValidFilterValue(filters?.dataFim)) {
      const fim = filters!.dataFim.length === 10 ? `${filters!.dataFim}T23:59:59.999-03:00` : filters!.dataFim;
      query = query.lte("created_at", fim);
    }
    if (isValidFilterValue(filters?.acao)) {
      query = query.eq("acao", filters!.acao);
    }
    if (isValidFilterValue(filters?.entidade)) {
      query = query.eq("entidade_tipo", filters!.entidade);
    }

    return query
      .order("created_at", { ascending: false })
      .range(from, to);
  },

  async getGlobalLogs(
    from: number,
    to: number,
    filters?: { dataInicio?: string; dataFim?: string; acao?: string; entidade?: string; search_cpf?: string }
  ) {
    let query = supabaseAdmin
      .from("historico_atividades")
      .select("*, usuarios(nome, telefone)", { count: "exact" });

    if (isValidFilterValue(filters?.search_cpf)) {
      const cleanSearch = filters!.search_cpf.trim();
      const digits = cleanSearch.replace(/\D/g, "");
      const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanSearch);

      if (isId) {
        query = query.in("usuario_id", [cleanSearch]);
      } else {
        let userQuery = supabaseAdmin.from("usuarios").select("id");
        if (digits && digits.length >= 3) {
          userQuery = userQuery.or(`cpfcnpj.ilike.%${digits}%,telefone.ilike.%${digits}%`);
        } else if (cleanSearch) {
          userQuery = userQuery.or(`nome.ilike.%${cleanSearch}%`);
        }
        const { data: uData } = await userQuery;
        if (uData && uData.length > 0) {
          query = query.in("usuario_id", uData.map((u: { id: string }) => u.id));
        } else {
          return { data: [], count: 0, error: null };
        }
      }
    }

    if (isValidFilterValue(filters?.dataInicio)) {
      const inicio = filters!.dataInicio.length === 10 ? `${filters!.dataInicio}T00:00:00.000-03:00` : filters!.dataInicio;
      query = query.gte("created_at", inicio);
    }
    if (isValidFilterValue(filters?.dataFim)) {
      const fim = filters!.dataFim.length === 10 ? `${filters!.dataFim}T23:59:59.999-03:00` : filters!.dataFim;
      query = query.lte("created_at", fim);
    }
    if (isValidFilterValue(filters?.acao)) {
      query = query.eq("acao", filters!.acao);
    }
    if (isValidFilterValue(filters?.entidade)) {
      query = query.eq("entidade_tipo", filters!.entidade);
    }

    return query
      .order("created_at", { ascending: false })
      .range(from, to);
  },
};
