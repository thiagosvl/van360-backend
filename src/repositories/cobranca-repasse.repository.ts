import { supabaseAdmin } from "../config/supabase.js";
import type { Tables, TablesInsert, TablesUpdate } from "../types/database.types.js";
import { StatusRepasseEnum } from "../types/enums.js";

export type CobrancaRepasse = Tables<"cobrancas_repasses">;
export type NovoCobrancaRepasse = TablesInsert<"cobrancas_repasses">;
export type AtualizarCobrancaRepasse = TablesUpdate<"cobrancas_repasses">;

export const cobrancaRepasseRepository = {
  async create(data: NovoCobrancaRepasse): Promise<CobrancaRepasse> {
    const { data: created, error } = await supabaseAdmin
      .from("cobrancas_repasses")
      .insert(data)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return created;
  },

  async getByTransacaoProvedorId(transacaoProvedorId: string): Promise<CobrancaRepasse | null> {
    const { data, error } = await supabaseAdmin
      .from("cobrancas_repasses")
      .select("*")
      .eq("transacao_provedor_id", transacaoProvedorId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  },

  async getByCobrancaId(cobrancaId: string): Promise<CobrancaRepasse | null> {
    const { data, error } = await supabaseAdmin
      .from("cobrancas_repasses")
      .select("*")
      .eq("cobranca_id", cobrancaId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  },

  async update(id: string, updateData: AtualizarCobrancaRepasse): Promise<CobrancaRepasse> {
    const { data, error } = await supabaseAdmin
      .from("cobrancas_repasses")
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return data;
  },

  async getPendentesParaConciliacao(): Promise<CobrancaRepasse[]> {
    const { data, error } = await supabaseAdmin
      .from("cobrancas_repasses")
      .select("*")
      .in("status_repasse", [
        StatusRepasseEnum.PENDENTE,
        StatusRepasseEnum.PROCESSANDO,
        StatusRepasseEnum.FALHA,
      ])
      .lt("tentativas", 5);

    if (error) {
      throw error;
    }

    return data || [];
  }
};
