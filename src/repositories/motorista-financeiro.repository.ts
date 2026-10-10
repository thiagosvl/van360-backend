import { supabaseAdmin } from "../config/supabase.js";
import { ConfigKey, ModoCobrancaEnum } from "../types/enums.js";
import type { Tables, TablesUpdate } from "../types/database.types.js";
import type { ResumoExcecoesModoCobrancaDTO } from "../types/dtos/motorista-financeiro.dto.js";

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
            modo_cobranca: ModoCobrancaEnum.DESATIVADO,
            chave_pix_repasse: usuario?.chave_pix || null,
            tipo_chave_pix: usuario?.tipo_chave_pix || null,
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
  },

  async getResumoExcecoesModoCobranca(usuarioId: string): Promise<ResumoExcecoesModoCobrancaDTO> {
    const { data, error } = await supabaseAdmin
      .from("passageiros")
      .select("modo_cobranca")
      .eq("usuario_id", usuarioId)
      .eq("ativo", true)
      .eq("isento", false);

    if (error) {
      throw error;
    }

    const rows = data || [];
    let padraoVan = 0;
    const excecoes = {
      DESATIVADO: 0,
      LEMBRETES: 0,
      AUTOMATICA: 0,
    };

    for (const r of rows) {
      if (!r.modo_cobranca) {
        padraoVan++;
      } else {
        const modo = r.modo_cobranca.toUpperCase() as keyof typeof excecoes;
        if (excecoes[modo] !== undefined) {
          excecoes[modo]++;
        }
      }
    }

    const totalExcecoes = excecoes.DESATIVADO + excecoes.LEMBRETES + excecoes.AUTOMATICA;

    return {
      total_alunos: rows.length,
      padrao_van: padraoVan,
      excecoes,
      total_excecoes: totalExcecoes,
    };
  }
};
