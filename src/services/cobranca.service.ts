import { supabaseAdmin } from "../config/supabase.js";
import { moneyToNumber } from "../utils/utils.js";

export const cobrancaService = {
  async createCobranca(data: any): Promise<any> {
    if (!data.passageiro_id || !data.usuario_id) throw new Error("Campos obrigatórios ausentes");

    const cobrancaData: any = {
      ...data,
      valor: typeof data.valor === "string" ? moneyToNumber(data.valor) : data.valor,
    };

    const { data: inserted, error } = await supabaseAdmin
      .from("cobrancas")
      .insert([cobrancaData])
      .select()
      .single();

    if (error) throw error;
    return inserted;
  },

  async updateCobranca(id: string, data: Partial<any>, cobrancaOriginal?: any): Promise<any> {
    if (!id) throw new Error("ID da cobrança é obrigatório");

    // Buscar cobrança original se não foi fornecida
    if (!cobrancaOriginal) {
      cobrancaOriginal = await this.getCobranca(id);
    }

    const isPaga = cobrancaOriginal?.status === "pago";

    const cobrancaData: any = {};

    // Campos que podem ser atualizados sempre
    if (data.valor !== undefined) cobrancaData.valor = data.valor;
    if (data.data_vencimento !== undefined) cobrancaData.data_vencimento = data.data_vencimento;
    if (data.status !== undefined) cobrancaData.status = data.status;
    if (data.pagamento_manual !== undefined) cobrancaData.pagamento_manual = data.pagamento_manual;
    if (data.tipo_pagamento !== undefined) cobrancaData.tipo_pagamento = data.tipo_pagamento;
    
    // Permite alterar data_pagamento se fornecida
    if (data.data_pagamento !== undefined) {
      cobrancaData.data_pagamento = data.data_pagamento;
    }

    // Permite alterar valor_pago se fornecido
    if (data.valor_pago !== undefined) {
      cobrancaData.valor_pago = moneyToNumber(data.valor_pago);
    }

    const { data: updated, error } = await supabaseAdmin
      .from("cobrancas")
      .update(cobrancaData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return updated;
  },

  async deleteCobranca(id: string): Promise<void> {
    if (!id) throw new Error("ID da cobrança é obrigatório");
    const { error } = await supabaseAdmin.from("cobrancas").delete().eq("id", id);
    if (error) throw error;
  },

  async getCobranca(id: string): Promise<any> {
    const { data, error } = await supabaseAdmin
      .from("cobrancas")
      .select("*, passageiros:passageiro_id (*, escolas:escola_id (*), veiculos:veiculo_id (*))")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  async listCobrancasByPassageiro(passageiroId: string, ano?: string): Promise<any[]> {
    let query = supabaseAdmin
      .from("cobrancas")
      .select("*, passageiros:passageiro_id (nome, nome_responsavel)")
      .eq("passageiro_id", passageiroId)
      .order("mes", { ascending: false });

    if (ano) query = query.eq("ano", ano);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async listCobrancasWithFilters(filtros: {
    mes?: string;
    ano?: string;
    passageiroId?: string;
    usuarioId?: string;
    status?: string;
  }): Promise<any[]> {
    let query = supabaseAdmin.from("cobrancas").select("*, passageiros(*)")
      .order("data_vencimento", { ascending: true })
      .order("passageiros(nome)", { ascending: true });

    if (filtros.passageiroId) query = query.eq("passageiro_id", filtros.passageiroId);
    if (filtros.usuarioId) query = query.eq("usuario_id", filtros.usuarioId);
    if (filtros.ano) query = query.eq("ano", filtros.ano);
    if (filtros.mes) query = query.eq("mes", filtros.mes);
    if (filtros.status) query = query.eq("status", filtros.status);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async countByPassageiro(passageiroId: string): Promise<number> {
    const { count, error } = await supabaseAdmin
      .from("cobrancas")
      .select("id", { count: "exact", head: true })
      .eq("passageiro_id", passageiroId);

    if (error) throw new Error(error.message || "Erro ao contar cobranças");
    return count || 0;
  },

  async listAvailableYearsByPassageiro(passageiroId: string): Promise<string[]> {
    if (!passageiroId) throw new Error("ID do passageiro é obrigatório");

    const { data, error } = await supabaseAdmin
      .from('cobrancas')
      .select('ano')
      .eq('passageiro_id', passageiroId)
      .order('ano', { ascending: false });

    if (error) throw error;

    const uniqueYears = Array.from(new Set(data.map(item => item.ano.toString())));
    const currentYear = new Date().getFullYear().toString();

    if (!uniqueYears.includes(currentYear)) {
      uniqueYears.unshift(currentYear);
    } else {
      const index = uniqueYears.indexOf(currentYear);
      if (index !== 0) {
        uniqueYears.splice(index, 1);
        uniqueYears.unshift(currentYear);
      }
    }

    return uniqueYears;
  },

  async toggleNotificacoes(cobrancaId: string, novoStatus: boolean): Promise<boolean> {

    const { error } = await supabaseAdmin
      .from("cobrancas")
      .update({ desativar_lembretes: novoStatus })
      .eq("id", cobrancaId);

    if (error) {
      throw new Error(`Falha ao ${novoStatus ? "ativar" : "desativar"} as notificações.`);
    }

    return novoStatus;
  },

};
