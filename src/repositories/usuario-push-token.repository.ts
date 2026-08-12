import { supabaseAdmin as supabase } from "../config/supabase.js";

export interface UsuarioPushToken {
  id: string;
  user_id: string;
  token: string;
  platform: string;
  created_at: string;
  updated_at: string;
}

export const usuarioPushTokenRepository = {
  async findByToken(token: string): Promise<UsuarioPushToken | null> {
    const { data } = await supabase
      .from('usuario_push_tokens')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    return data;
  },

  async countTokensByUsuarioId(userId: string): Promise<number> {
    const { count } = await supabase
      .from('usuario_push_tokens')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    return count ?? 0;
  },

  async findTokensByUsuarioId(userId: string): Promise<string[]> {
    const { data } = await supabase
      .from('usuario_push_tokens')
      .select('token')
      .eq('user_id', userId);

    if (!data) return [];
    return data.map((t: { token: string }) => t.token);
  },

  async findUsuarioByTelefone(telefone: string): Promise<{ id: string; email?: string } | null> {
    const { data } = await supabase
      .from('usuarios')
      .select('id, email')
      .eq('telefone', telefone)
      .maybeSingle();

    return data;
  },

  async findUsuarioById(userId: string): Promise<{ id: string; nome: string; telefone: string; email?: string } | null> {
    const { data } = await supabase
      .from('usuarios')
      .select('id, nome, telefone, email')
      .eq('id', userId)
      .maybeSingle();

    return data;
  },

  async insertToken(userId: string, token: string, platform: string): Promise<void> {
    const { error } = await supabase
      .from('usuario_push_tokens')
      .insert({
        user_id: userId,
        token,
        platform
      });

    if (error) throw error;
  },

  async updateTokenPlatformAndTimestamp(token: string, platform: string): Promise<void> {
    const { error } = await supabase
      .from('usuario_push_tokens')
      .update({
        platform,
        updated_at: new Date().toISOString()
      })
      .eq('token', token);

    if (error) throw error;
  },

  async deleteByToken(token: string): Promise<void> {
    const { error } = await supabase
      .from('usuario_push_tokens')
      .delete()
      .eq('token', token);

    if (error) throw error;
  },

  async deleteByTokens(tokens: string[]): Promise<void> {
    if (tokens.length === 0) return;
    const { error } = await supabase
      .from('usuario_push_tokens')
      .delete()
      .in('token', tokens);

    if (error) throw error;
  }
};
