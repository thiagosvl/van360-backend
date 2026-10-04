import { supabaseAdmin } from "../config/supabase.js";
import { ConfigKey } from "../types/enums.js";
import type { Tables, TablesUpdate } from "../types/database.types.js";

type MotoristaConfiguracaoFinanceira = Tables<"motorista_configuracoes_financeiras">;
type MotoristaConfiguracaoFinanceiraUpdate = TablesUpdate<"motorista_configuracoes_financeiras">;

export const motoristaFinanceiroRepository = {
  async getByUsuarioId(usuarioId: string): Promise<MotoristaConfiguracaoFinanceira> {
    const { data, error } = await supabaseAdmin
      .from("motorista_configuracoes_financeiras")
      .select("*")
      .eq("usuario_id", usuarioId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      const { data: usuario } = await supabaseAdmin
        .from("usuarios")
        .select("chave_pix, tipo_chave_pix")
        .eq("id", usuarioId)
        .single();

      const { data: newConfig, error: insertError } = await supabaseAdmin
        .from("motorista_configuracoes_financeiras")
        .upsert(
          {
            usuario_id: usuarioId,
            modalidade_cobranca: "MANUAL",
            cobranca_automatica_ativa: false,
            chave_pix_repasse: usuario?.chave_pix || null,
            tipo_chave_pix: usuario?.tipo_chave_pix || null,
            repassar_taxa_pais_padrao: false,
          },
          { onConflict: "usuario_id" }
        )
        .select("*")
        .single();

      if (insertError) {
        throw insertError;
      }

      return newConfig;
    }

    return data;
  },

  async update(usuarioId: string, updateData: MotoristaConfiguracaoFinanceiraUpdate): Promise<MotoristaConfiguracaoFinanceira> {
    const { data, error } = await supabaseAdmin
      .from("motorista_configuracoes_financeiras")
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      })
      .eq("usuario_id", usuarioId)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return data;
  },

  async getTaxaPadraoGlobal(): Promise<number> {
    const { data } = await supabaseAdmin
      .from("configuracao_interna")
      .select("valor")
      .eq("chave", ConfigKey.TAXA_COBRANCA_AUTOMATICA_PADRAO)
      .maybeSingle();

    if (data && data.valor) {
      const parsed = parseFloat(data.valor);
      if (!isNaN(parsed) && parsed >= 0) return parsed;
    }

    return 4.0;
  }
};
