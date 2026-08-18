import { supabaseAdmin as supabase } from "../config/supabase.js";
import { UserType } from "../types/enums.js";
import { onlyDigits, getPhoneVariants } from "../utils/string.utils.js";

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
    const candidateIds = await this.resolveCandidateUserIds(userId);
    if (candidateIds.length === 0) return 0;

    const { count } = await supabase
      .from('usuario_push_tokens')
      .select('*', { count: 'exact', head: true })
      .in('user_id', candidateIds);

    return count ?? 0;
  },

  async resolveCandidateUserIds(userId: string): Promise<string[]> {
    if (!userId) return [];
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
          candidateIds.push(...getPhoneVariants(resp.telefone));
        }
      } catch {
        // Ignora erro
      }
    } else {
      const variants = getPhoneVariants(userId);
      if (variants.length > 0) {
        candidateIds.push(...variants);

        try {
          const { data: respList } = await supabase
            .from('responsaveis')
            .select('id')
            .in('telefone', variants);

          if (respList && respList.length > 0) {
            for (const r of respList) {
              if (r.id) candidateIds.push(r.id);
            }
          }
        } catch {
          // Ignora erro
        }
      }
    }

    return Array.from(new Set(candidateIds.filter(Boolean)));
  },

  async findTokensByUsuarioId(userId: string): Promise<string[]> {
    const uniqueIds = await this.resolveCandidateUserIds(userId);
    if (uniqueIds.length === 0) return [];

    const { data } = await supabase
      .from('usuario_push_tokens')
      .select('token')
      .in('user_id', uniqueIds);

    if (!data) return [];
    return data.map((t: { token: string }) => t.token);
  },

  async deleteTokensByUsuarioId(userId: string): Promise<void> {
    const candidateIds = await this.resolveCandidateUserIds(userId);
    if (candidateIds.length === 0) return;

    await supabase
      .from('usuario_push_tokens')
      .delete()
      .in('user_id', candidateIds);
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
