import { supabaseAdmin } from "../config/supabase.js";
import { UpdateConfiguracoesDTO } from "../types/dtos/configuracoes.dto.js";

export const usuarioConfiguracoesRepository = {
  async getByUsuarioId(usuarioId: string) {
    const { data, error } = await supabaseAdmin
      .from("usuario_configuracoes")
      .select("*")
      .eq("usuario_id", usuarioId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      const { data: newConfig, error: insertError } = await supabaseAdmin
        .from("usuario_configuracoes")
        .upsert(
          { usuario_id: usuarioId },
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

  async update(usuarioId: string, updates: UpdateConfiguracoesDTO) {
    const payload = {
      usuario_id: usuarioId,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("usuario_configuracoes")
      .upsert(payload, { onConflict: "usuario_id" })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return data;
  },
};
