import { supabaseAdmin } from "../config/supabase.js";

export interface ResponsavelPassageiroRecord {
  id: string;
  nome: string;
  ativo: boolean;
  pin_acesso: string | null;
  motorista_nome: string;
  motorista_id: string;
  tipo_responsavel: "principal" | "adicional";
  responsavel_id: string;
}

export const responsavelRepository = {
  async findPassageirosByPhone(phoneDigits: string): Promise<ResponsavelPassageiroRecord[]> {
    const { data: passageirosPrincipais, error: errPrincipal } = await supabaseAdmin
      .from("passageiros")
      .select(`
        id,
        nome,
        ativo,
        pin_acesso,
        usuario_id,
        usuario:usuarios(id, nome_exibicao, nome_fantasia)
      `)
      .eq("telefone_responsavel", phoneDigits)
      .eq("ativo", true);

    if (errPrincipal) throw errPrincipal;

    const { data: adicionais, error: errAdicionais } = await supabaseAdmin
      .from("passageiro_responsaveis_adicionais")
      .select(`
        id,
        pin_acesso,
        passageiro_id,
        passageiro:passageiros(
          id,
          nome,
          ativo,
          usuario_id,
          usuario:usuarios(id, nome_exibicao, nome_fantasia)
        )
      `)
      .eq("telefone", phoneDigits);

    if (errAdicionais) throw errAdicionais;

    const result: ResponsavelPassageiroRecord[] = [];

    if (passageirosPrincipais) {
      for (const p of passageirosPrincipais) {
        const usr = Array.isArray(p.usuario) ? p.usuario[0] : p.usuario;
        result.push({
          id: p.id,
          nome: p.nome,
          ativo: p.ativo,
          pin_acesso: p.pin_acesso,
          motorista_nome: usr?.nome_fantasia || usr?.nome_exibicao || "Motorista",
          motorista_id: p.usuario_id,
          tipo_responsavel: "principal",
          responsavel_id: p.id
        });
      }
    }

    if (adicionais) {
      for (const a of adicionais) {
        const pass = Array.isArray(a.passageiro) ? a.passageiro[0] : a.passageiro;
        if (pass && pass.ativo) {
          const usr = Array.isArray(pass.usuario) ? pass.usuario[0] : pass.usuario;
          result.push({
            id: pass.id,
            nome: pass.nome,
            ativo: pass.ativo,
            pin_acesso: a.pin_acesso,
            motorista_nome: usr?.nome_fantasia || usr?.nome_exibicao || "Motorista",
            motorista_id: pass.usuario_id,
            tipo_responsavel: "adicional",
            responsavel_id: a.id
          });
        }
      }
    }

    return result;
  },

  async updatePinPrincipal(passageiroId: string, pinHash: string) {
    return supabaseAdmin
      .from("passageiros")
      .update({ pin_acesso: pinHash })
      .eq("id", passageiroId);
  },

  async updatePinAdicional(responsavelId: string, pinHash: string) {
    return supabaseAdmin
      .from("passageiro_responsaveis_adicionais")
      .update({ pin_acesso: pinHash })
      .eq("id", responsavelId);
  },

  async resetPinPrincipal(passageiroId: string) {
    return supabaseAdmin
      .from("passageiros")
      .update({ pin_acesso: null })
      .eq("id", passageiroId);
  },

  async resetPinAdicional(responsavelId: string) {
    return supabaseAdmin
      .from("passageiro_responsaveis_adicionais")
      .update({ pin_acesso: null })
      .eq("id", responsavelId);
  },

  async getPassageiroCarteirinha(passageiroId: string) {
    const { data, error } = await supabaseAdmin
      .from("passageiros")
      .select("id, nome, ativo")
      .eq("id", passageiroId)
      .single();

    if (error) throw error;
    return data;
  }
};
