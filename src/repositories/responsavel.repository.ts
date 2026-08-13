import { supabaseAdmin } from "../config/supabase.js";
import { TipoResponsavel } from "../types/enums.js";

export interface ResponsavelPassageiroRecord {
  id: string;
  nome: string;
  ativo: boolean;
  pin_acesso: string | null;
  motorista_nome: string;
  motorista_id: string;
  tipo_responsavel: TipoResponsavel;
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
        usuario:usuarios(id, nome, apelido)
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
          usuario:usuarios(id, nome, apelido)
        )
      `)
      .eq("telefone", phoneDigits);

    if (errAdicionais) throw errAdicionais;

    const result: ResponsavelPassageiroRecord[] = [];
    const seenPassageiroIds = new Set<string>();

    if (passageirosPrincipais) {
      for (const p of passageirosPrincipais) {
        if (seenPassageiroIds.has(p.id)) continue;
        seenPassageiroIds.add(p.id);

        const usr = Array.isArray(p.usuario) ? p.usuario[0] : p.usuario;
        const motoristaNome = usr?.apelido?.trim() || usr?.nome?.trim() || "";
        result.push({
          id: p.id,
          nome: p.nome,
          ativo: p.ativo,
          pin_acesso: p.pin_acesso,
          motorista_nome: motoristaNome,
          motorista_id: p.usuario_id,
          tipo_responsavel: TipoResponsavel.PRINCIPAL,
          responsavel_id: p.id
        });
      }
    }

    if (adicionais) {
      for (const a of adicionais) {
        const pass = Array.isArray(a.passageiro) ? a.passageiro[0] : a.passageiro;
        if (pass && pass.ativo && !seenPassageiroIds.has(pass.id)) {
          seenPassageiroIds.add(pass.id);
          const usr = Array.isArray(pass.usuario) ? pass.usuario[0] : pass.usuario;
          const motoristaNome = usr?.apelido?.trim() || usr?.nome?.trim() || "";
          result.push({
            id: pass.id,
            nome: pass.nome,
            ativo: pass.ativo,
            pin_acesso: a.pin_acesso,
            motorista_nome: motoristaNome,
            motorista_id: pass.usuario_id,
            tipo_responsavel: TipoResponsavel.ADICIONAL,
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

  async getPassageiroCarteirinha(passageiroId: string, target?: ResponsavelPassageiroRecord) {
    const { data, error } = await supabaseAdmin
      .from("passageiros")
      .select("id, nome, ativo, cpf_responsavel, email_responsavel, nome_responsavel, telefone_responsavel")
      .eq("id", passageiroId)
      .single();

    if (error) throw error;

    if (target && target.tipo_responsavel === TipoResponsavel.ADICIONAL) {
      const { data: adicional } = await supabaseAdmin
        .from("passageiro_responsaveis_adicionais")
        .select("cpf, email")
        .eq("id", target.responsavel_id)
        .single();

      if (adicional) {
        return {
          ...data,
          cpf_responsavel: adicional.cpf || null,
          email_responsavel: adicional.email || null
        };
      }
    }

    return data;
  },

  async updateDadosComplementaresPrincipal(passageiroId: string, cpf: string, email: string) {
    return supabaseAdmin
      .from("passageiros")
      .update({
        cpf_responsavel: cpf,
        email_responsavel: email
      })
      .eq("id", passageiroId);
  },

  async updateDadosComplementaresAdicional(responsavelId: string, cpf: string, email: string) {
    return supabaseAdmin
      .from("passageiro_responsaveis_adicionais")
      .update({
        cpf: cpf,
        email: email
      })
      .eq("id", responsavelId);
  },

  async findEmailsByPhone(phoneDigits: string): Promise<string[]> {
    const { data: main } = await supabaseAdmin
      .from("passageiros")
      .select("email_responsavel")
      .eq("telefone_responsavel", phoneDigits)
      .eq("ativo", true);

    const { data: add } = await supabaseAdmin
      .from("passageiro_responsaveis_adicionais")
      .select("email, passageiro:passageiros(ativo)")
      .eq("telefone", phoneDigits);

    const emailsSet = new Set<string>();

    if (main) {
      for (const m of main) {
        if (m.email_responsavel && m.email_responsavel.trim()) {
          emailsSet.add(m.email_responsavel.trim().toLowerCase());
        }
      }
    }

    if (add) {
      for (const a of add) {
        const pass = Array.isArray(a.passageiro) ? a.passageiro[0] : a.passageiro;
        if (pass && pass.ativo && a.email && a.email.trim()) {
          emailsSet.add(a.email.trim().toLowerCase());
        }
      }
    }

    return Array.from(emailsSet);
  }
};
