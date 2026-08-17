import { supabaseAdmin as supabase } from "../config/supabase.js";
import { UserType } from "../types/enums.js";
import { onlyDigits } from "../utils/string.utils.js";

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
    const candidateIds: string[] = [userId];
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);

    if (isUUID) {
      try {
        const { data: resp } = await supabase
          .from('responsaveis')
          .select('id, telefone')
          .eq('id', userId)
          .maybeSingle();

        if (resp?.telefone) {
          const digits = onlyDigits(resp.telefone);
          if (digits) {
            const phoneWithout55 = digits.startsWith('55') && digits.length > 11 ? digits.substring(2) : digits;
            const phoneWith55 = `55${phoneWithout55}`;
            candidateIds.push(digits, phoneWithout55, phoneWith55);
          }
        }
      } catch {
        // Ignora caso a tabela ainda não esteja acessível
      }
    } else {
      const phoneDigits = onlyDigits(userId);
      if (phoneDigits) {
        const phoneWithout55 = phoneDigits.startsWith('55') && phoneDigits.length > 11 ? phoneDigits.substring(2) : phoneDigits;
        const phoneWith55 = `55${phoneWithout55}`;
        candidateIds.push(phoneDigits, phoneWithout55, phoneWith55);

        try {
          const { data: respList } = await supabase
            .from('responsaveis')
            .select('id')
            .in('telefone', [phoneDigits, phoneWithout55, phoneWith55]);

          if (respList && respList.length > 0) {
            for (const r of respList) {
              if (r.id) candidateIds.push(r.id);
            }
          }
        } catch {
          // Ignora caso erro
        }
      }
    }

    const uniqueIds = Array.from(new Set(candidateIds));

    const { data } = await supabase
      .from('usuario_push_tokens')
      .select('token')
      .in('user_id', uniqueIds);

    if (!data) return [];
    return data.map((t: { token: string }) => t.token);
  },

  async findUsuarioByTelefoneOrEmail(identifier: string): Promise<{ id: string; email?: string; tipo?: UserType | string } | null> {
    if (!identifier) return null;

    if (identifier.includes('@')) {
      const cleanEmail = identifier.trim().toLowerCase();
      const { data } = await supabase
        .from('usuarios')
        .select('id, email, tipo')
        .eq('email', cleanEmail)
        .maybeSingle();

      return data;
    }

    const phoneDigits = onlyDigits(identifier);
    if (!phoneDigits) return null;

    const { data } = await supabase
      .from('usuarios')
      .select('id, email, tipo')
      .eq('telefone', phoneDigits)
      .maybeSingle();

    return data;
  },

  async findUsuarioByTelefone(telefone: string): Promise<{ id: string; email?: string; tipo?: UserType | string } | null> {
    return this.findUsuarioByTelefoneOrEmail(telefone);
  },

  async findUsuarioById(userId: string): Promise<{ id: string; nome: string; telefone: string; email?: string; tipo?: UserType | string } | null> {
    const { data } = await supabase
      .from('usuarios')
      .select('id, nome, telefone, email, tipo')
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
