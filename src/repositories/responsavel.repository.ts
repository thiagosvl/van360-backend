import { supabaseAdmin } from "../config/supabase.js";
import { TipoResponsavel, RouteSentido } from "../types/enums.js";
import { AppError } from "../errors/AppError.js";

export interface ResponsavelPassageiroRecord {
  id: string; // passageiro_id
  nome: string;
  ativo: boolean;
  pin_acesso: string | null;
  motorista_nome: string;
  motorista_id: string;
  tipo_responsavel: TipoResponsavel;
  responsavel_id: string;
}

export const responsavelRepository = {
  async findByTelefoneVariants(telefones: string[]) {
    const { data, error } = await supabaseAdmin
      .from("responsaveis")
      .select("id, nome, telefone, cpf, email, logradouro, numero, bairro, cidade, estado, cep, referencia, complemento")
      .in("telefone", telefones)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  },
  async findPassageirosByPhone(phoneDigits: string): Promise<ResponsavelPassageiroRecord[]> {
    const { data: responsavel, error: errResp } = await supabaseAdmin
      .from("responsaveis")
      .select(`
        id,
        pin_acesso,
        passageiro_links:passageiro_responsaveis(
          id,
          tipo,
          parentesco,
          passageiro:passageiros(
            id,
            nome,
            ativo,
            usuario_id,
            usuario:usuarios(id, nome, apelido)
          )
        )
      `)
      .eq("telefone", phoneDigits)
      .maybeSingle();

    if (errResp) throw errResp;
    if (!responsavel || !responsavel.passageiro_links) return [];

    const result: ResponsavelPassageiroRecord[] = [];
    const seenPassageiroIds = new Set<string>();

    for (const link of responsavel.passageiro_links as any[]) {
      const pass = Array.isArray(link.passageiro) ? link.passageiro[0] : link.passageiro;
      if (pass && pass.ativo && !seenPassageiroIds.has(pass.id)) {
        seenPassageiroIds.add(pass.id);
        const usr = Array.isArray(pass.usuario) ? pass.usuario[0] : pass.usuario;
        const motoristaNome = usr?.apelido?.trim() || usr?.nome?.trim() || "";

        result.push({
          id: pass.id,
          nome: pass.nome,
          ativo: pass.ativo,
          pin_acesso: responsavel.pin_acesso,
          motorista_nome: motoristaNome,
          motorista_id: pass.usuario_id,
          tipo_responsavel: link.tipo === TipoResponsavel.ADICIONAL ? TipoResponsavel.ADICIONAL : TipoResponsavel.PRINCIPAL,
          responsavel_id: responsavel.id
        });
      }
    }

    return result.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR", { sensitivity: "base" }));
  },

  async updatePinByPhone(phoneDigits: string, pinHash: string) {
    return supabaseAdmin
      .from("responsaveis")
      .update({ pin_acesso: pinHash, updated_at: new Date().toISOString() })
      .eq("telefone", phoneDigits);
  },

  async updatePinById(responsavelId: string, pinHash: string) {
    return supabaseAdmin
      .from("responsaveis")
      .update({ pin_acesso: pinHash, updated_at: new Date().toISOString() })
      .eq("id", responsavelId);
  },

  async resetPinByPhone(phoneDigits: string) {
    return supabaseAdmin
      .from("responsaveis")
      .update({ pin_acesso: null, updated_at: new Date().toISOString() })
      .eq("telefone", phoneDigits);
  },

  async resetPinById(responsavelId: string) {
    return supabaseAdmin
      .from("responsaveis")
      .update({ pin_acesso: null, updated_at: new Date().toISOString() })
      .eq("id", responsavelId);
  },

  // Mantidos aliases para compatibilidade com chamadas existentes
  async updatePinPrincipal(passageiroId: string, pinHash: string) {
    const { data: link } = await supabaseAdmin
      .from("passageiro_responsaveis")
      .select("responsavel_id")
      .eq("passageiro_id", passageiroId)
      .eq("tipo", TipoResponsavel.PRINCIPAL)
      .maybeSingle();

    if (link?.responsavel_id) {
      return this.updatePinById(link.responsavel_id, pinHash);
    }
  },

  async updatePinAdicional(responsavelId: string, pinHash: string) {
    return this.updatePinById(responsavelId, pinHash);
  },

  async resetPinPrincipal(passageiroId: string) {
    const { data: link } = await supabaseAdmin
      .from("passageiro_responsaveis")
      .select("responsavel_id")
      .eq("passageiro_id", passageiroId)
      .eq("tipo", TipoResponsavel.PRINCIPAL)
      .maybeSingle();

    if (link?.responsavel_id) {
      return this.resetPinById(link.responsavel_id);
    }
  },

  async resetPinAdicional(responsavelId: string) {
    return this.resetPinById(responsavelId);
  },

  async getPassageiroCarteirinha(passageiroId: string, target?: ResponsavelPassageiroRecord) {
    const { data: passageiro, error: errPass } = await supabaseAdmin
      .from("passageiros")
      .select(`
        id, usuario_id, nome, genero, data_nascimento, periodo, modalidade, turma, nome_professor,
        data_inicio_transporte, data_fim_transporte,
        observacoes,
        ativo, isento,
        escola_id, veiculo_id,
        escola:escolas (id, nome),
        veiculo:veiculos (id, placa, modelo),
        usuario:usuarios (id, nome, apelido, telefone),
        responsaveis_links:passageiro_responsaveis (
          id, tipo, parentesco,
          responsavel:responsaveis (id, nome, telefone, cpf, email, logradouro, numero, bairro, cidade, estado, cep, referencia, complemento)
        )
      `)
      .eq("id", passageiroId)
      .single();

    if (errPass) throw errPass;

    const links = (passageiro.responsaveis_links as any[]) || [];
    const principalLink = links.find((l: any) => l.tipo === TipoResponsavel.PRINCIPAL) || links[0];
    const rawPrincipalResp = principalLink?.responsavel;
    const principalResp = Array.isArray(rawPrincipalResp) ? rawPrincipalResp[0] : (rawPrincipalResp || null);

    let targetResp = principalResp;
    if (target && target.responsavel_id) {
      const foundLink = links.find((l: any) => {
        const r = Array.isArray(l.responsavel) ? l.responsavel[0] : l.responsavel;
        return r?.id === target.responsavel_id;
      });
      if (foundLink?.responsavel) {
        targetResp = Array.isArray(foundLink.responsavel) ? foundLink.responsavel[0] : foundLink.responsavel;
      }
    }

    const { data: cobrancas } = await supabaseAdmin
      .from("cobrancas")
      .select("id, mes, ano, valor, status, data_vencimento, recibo_url, desativar_lembretes")
      .eq("passageiro_id", passageiroId)
      .order("ano", { ascending: false })
      .order("mes", { ascending: false });

    const { data: ausencias } = await supabaseAdmin
      .from("rota_ausencias")
      .select("id, rota_id, data_ausencia, sentido, created_at, rota:rotas(id, nome)")
      .eq("passageiro_id", passageiroId)
      .order("data_ausencia", { ascending: false });

    const ausenciasMapeadas = (ausencias || []).map((a: any) => {
      const r = Array.isArray(a.rota) ? a.rota[0] : a.rota;
      return {
        id: a.id,
        rota_id: a.rota_id,
        data_ausencia: a.data_ausencia,
        sentido: a.sentido || RouteSentido.INDO,
        periodo: a.sentido || RouteSentido.INDO,
        created_at: a.created_at,
        rota: r ? { id: r.id, nome: r.nome } : null
      };
    });

    const { data: contratos } = await supabaseAdmin
      .from("contratos")
      .select("id, status, minuta_url, contrato_final_url, token_acesso, created_at")
      .eq("passageiro_id", passageiroId)
      .order("created_at", { ascending: false })
      .limit(1);

    const contrato = contratos && contratos.length > 0 ? contratos[0] : null;

    const responsaveisAdicionais = links
      .filter((l: any) => l.tipo === TipoResponsavel.ADICIONAL && l.responsavel)
      .map((l: any) => {
        const r = Array.isArray(l.responsavel) ? l.responsavel[0] : l.responsavel;
        return {
          id: r?.id,
          passageiro_id: passageiroId,
          nome: r?.nome || null,
          telefone: r?.telefone || null,
          cpf: r?.cpf || null,
          email: r?.email || null,
          parentesco: l.parentesco || null,
          logradouro: r?.logradouro || null,
          numero: r?.numero || null,
          bairro: r?.bairro || null,
          cidade: r?.cidade || null,
          estado: r?.estado || null,
          cep: r?.cep || null,
          referencia: r?.referencia || null,
          complemento: r?.complemento || null
        };
      })
      .filter((r: any) => Boolean(r.id));

    const { data: rotasVinculadas } = await supabaseAdmin
      .from("rota_passageiros")
      .select("id, rota_id, rota:rotas (id, nome, veiculo_id)")
      .eq("passageiro_id", passageiroId);

    const rotasMap = new Map<string, any>();
    if (rotasVinculadas) {
      for (const item of rotasVinculadas) {
        const r = Array.isArray(item.rota) ? item.rota[0] : item.rota;
        if (r && r.id && !rotasMap.has(r.id)) {
          rotasMap.set(r.id, {
            id: r.id,
            nome: r.nome,
            veiculo_id: r.veiculo_id || null
          });
        }
      }
    }
    const rotas = Array.from(rotasMap.values());

    const usr = Array.isArray(passageiro.usuario) ? passageiro.usuario[0] : passageiro.usuario;
    const esc = Array.isArray(passageiro.escola) ? passageiro.escola[0] : passageiro.escola;
    const veic = Array.isArray(passageiro.veiculo) ? passageiro.veiculo[0] : passageiro.veiculo;

    return {
      ...passageiro,
      responsavel_principal: principalResp?.id ? {
        id: principalResp.id,
        nome: principalResp.nome || null,
        telefone: principalResp.telefone || null,
        cpf: principalResp.cpf || null,
        email: principalResp.email || null,
        parentesco: principalLink?.parentesco || null,
        logradouro: principalResp.logradouro || null,
        numero: principalResp.numero || null,
        bairro: principalResp.bairro || null,
        cidade: principalResp.cidade || null,
        estado: principalResp.estado || null,
        cep: principalResp.cep || null,
        referencia: principalResp.referencia || null,
        complemento: principalResp.complemento || null
      } : null,
      motorista_nome: usr?.apelido?.trim() || usr?.nome?.trim() || "Motorista",
      motorista_telefone: usr?.telefone || "",
      motorista_foto: null,
      escola_nome: esc?.nome || null,
      veiculo_placa: veic?.placa || null,
      veiculo_modelo: veic?.modelo || null,
      cobrancas: cobrancas || [],
      ausencias: ausenciasMapeadas || [],
      contrato: contrato || null,
      responsaveis: responsaveisAdicionais || [],
      rotas: rotas || []
    };
  },

  async insertAusenciaResponsavel(
    passageiroId: string,
    usuarioId: string,
    data: { data_ausencia: string; rota_id: string; periodo?: string | null; sentido?: string | null }
  ) {
    const sentidoVal = data.sentido === RouteSentido.VOLTANDO || data.periodo === "volta" ? RouteSentido.VOLTANDO : RouteSentido.INDO;
    const { data: result, error } = await supabaseAdmin
      .from("rota_ausencias")
      .insert([{
        passageiro_id: passageiroId,
        rota_id: data.rota_id,
        data_ausencia: data.data_ausencia,
        sentido: sentidoVal,
        registrado_por: null
      }])
      .select()
      .single();

    if (error) throw error;
    return result;
  },

  async deleteAusenciaResponsavel(passageiroId: string, ausenciaId: string) {
    const { error } = await supabaseAdmin
      .from("rota_ausencias")
      .delete()
      .eq("id", ausenciaId)
      .eq("passageiro_id", passageiroId);

    if (error) throw error;
    return true;
  },

  async updateDadosComplementaresPrincipal(passageiroId: string, cpf: string, email: string) {
    const { data: link } = await supabaseAdmin
      .from("passageiro_responsaveis")
      .select("responsavel_id")
      .eq("passageiro_id", passageiroId)
      .eq("tipo", TipoResponsavel.PRINCIPAL)
      .maybeSingle();

    if (link?.responsavel_id) {
      return supabaseAdmin
        .from("responsaveis")
        .update({ cpf, email, updated_at: new Date().toISOString() })
        .eq("id", link.responsavel_id);
    }
  },

  async updateDadosComplementaresAdicional(responsavelId: string, cpf: string, email: string) {
    return supabaseAdmin
      .from("responsaveis")
      .update({ cpf, email, updated_at: new Date().toISOString() })
      .eq("id", responsavelId);
  },

  async findEmailsByPhone(phoneDigits: string): Promise<string[]> {
    const { data } = await supabaseAdmin
      .from("responsaveis")
      .select("email")
      .eq("telefone", phoneDigits);

    if (!data) return [];
    return data
      .map(r => r.email)
      .filter((e): e is string => Boolean(e && e.trim()))
      .map(e => e.trim().toLowerCase());
  },

  async updateObservacoes(passageiroId: string, observacoes: string) {
    const { error } = await supabaseAdmin
      .from("passageiros")
      .update({ observacoes })
      .eq("id", passageiroId);

    if (error) throw error;
    return true;
  },

  async addResponsavelAdicional(passageiroId: string, data: Record<string, any>) {
    const phoneDigits = String(data.telefone || "").replace(/\D/g, "");
    let responsavelId: string;

    const { data: existing } = await supabaseAdmin
      .from("responsaveis")
      .select("id, nome, cpf, email, logradouro, numero, bairro, cidade, estado, cep, referencia, complemento")
      .eq("telefone", phoneDigits)
      .maybeSingle();

    if (existing) {
      responsavelId = existing.id;
      const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() };
      // Só preenche se o campo estivesse nulo anteriormente para não sobrescrever dados existentes
      if (!existing.nome && data.nome) updatePayload.nome = data.nome;
      if (!existing.cpf && data.cpf) updatePayload.cpf = data.cpf;
      if (!existing.email && data.email) updatePayload.email = data.email;
      if (!existing.logradouro && data.logradouro) updatePayload.logradouro = data.logradouro;
      if (!existing.numero && data.numero) updatePayload.numero = data.numero;
      if (!existing.bairro && data.bairro) updatePayload.bairro = data.bairro;
      if (!existing.cidade && data.cidade) updatePayload.cidade = data.cidade;
      if (!existing.estado && data.estado) updatePayload.estado = data.estado;
      if (!existing.cep && data.cep) updatePayload.cep = data.cep;
      if (!existing.referencia && data.referencia) updatePayload.referencia = data.referencia;
      if (!existing.complemento && data.complemento) updatePayload.complemento = data.complemento;

      if (Object.keys(updatePayload).length > 1) {
        await supabaseAdmin
          .from("responsaveis")
          .update(updatePayload)
          .eq("id", responsavelId);
      }
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from("responsaveis")
        .insert([{
          telefone: phoneDigits,
          nome: data.nome,
          cpf: data.cpf || null,
          email: data.email || null,
          logradouro: data.logradouro || null,
          numero: data.numero || null,
          bairro: data.bairro || null,
          cidade: data.cidade || null,
          estado: data.estado || null,
          cep: data.cep || null,
          referencia: data.referencia || null,
          complemento: data.complemento || null,
        }])
        .select()
        .single();
      if (error) throw error;
      responsavelId = inserted.id;
    }

    // Checa se este responsável já possui um vínculo com o passageiro
    const { data: existingLink } = await supabaseAdmin
      .from("passageiro_responsaveis")
      .select("id, tipo")
      .eq("passageiro_id", passageiroId)
      .eq("responsavel_id", responsavelId)
      .maybeSingle();

    if (existingLink) {
      throw new AppError("Este responsável já está vinculado a este passageiro.", 400);
    }

    const { data: existingPrincipal } = await supabaseAdmin
      .from("passageiro_responsaveis")
      .select("id")
      .eq("passageiro_id", passageiroId)
      .eq("tipo", TipoResponsavel.PRINCIPAL)
      .maybeSingle();

    const tipoLink = existingPrincipal ? TipoResponsavel.ADICIONAL : TipoResponsavel.PRINCIPAL;

    const { data: link, error: errLink } = await supabaseAdmin
      .from("passageiro_responsaveis")
      .insert({
        passageiro_id: passageiroId,
        responsavel_id: responsavelId,
        tipo: tipoLink,
        parentesco: data.parentesco || null,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (errLink) throw errLink;
    return { ...link, ...data, id: responsavelId };
  },

  async updateResponsavelAdicional(responsavelId: string, data: Record<string, any>, passageiroId?: string) {
    const respPayload: Record<string, any> = { updated_at: new Date().toISOString() };
    if (data.nome !== undefined && data.nome !== null) respPayload.nome = data.nome;
    if (data.cpf !== undefined) respPayload.cpf = data.cpf;
    if (data.email !== undefined) respPayload.email = data.email;
    if (data.telefone !== undefined && data.telefone !== null) respPayload.telefone = data.telefone;
    if (data.logradouro !== undefined) respPayload.logradouro = data.logradouro;
    if (data.numero !== undefined) respPayload.numero = data.numero;
    if (data.bairro !== undefined) respPayload.bairro = data.bairro;
    if (data.cidade !== undefined) respPayload.cidade = data.cidade;
    if (data.estado !== undefined) respPayload.estado = data.estado;
    if (data.cep !== undefined) respPayload.cep = data.cep;
    if (data.referencia !== undefined) respPayload.referencia = data.referencia;
    if (data.complemento !== undefined) respPayload.complemento = data.complemento;

    const { data: updated, error } = await supabaseAdmin
      .from("responsaveis")
      .update(respPayload)
      .eq("id", responsavelId)
      .select()
      .single();

    if (error) throw error;

    const targetPassageiroId = passageiroId || data.passageiroId;
    let effectivePassageiroId = targetPassageiroId;

    if (data.parentesco !== undefined && !effectivePassageiroId) {
      const { data: links } = await supabaseAdmin
        .from("passageiro_responsaveis")
        .select("passageiro_id")
        .eq("responsavel_id", responsavelId);
      if (links && links.length === 1) {
        effectivePassageiroId = links[0].passageiro_id;
      }
    }

    if (data.parentesco !== undefined && effectivePassageiroId) {
      await supabaseAdmin
        .from("passageiro_responsaveis")
        .update({ parentesco: data.parentesco || null, updated_at: new Date().toISOString() })
        .eq("passageiro_id", effectivePassageiroId)
        .eq("responsavel_id", responsavelId);
    }

    return updated;
  },

  async deleteResponsavelAdicional(responsavelId: string) {
    const { error } = await supabaseAdmin
      .from("passageiro_responsaveis")
      .delete()
      .eq("responsavel_id", responsavelId);

    if (error) throw error;
    await cleanupOrphanedResponsaveis([responsavelId]);
    return true;
  },

  async setPrincipalResponsavel(passageiroId: string, responsavelId: string) {
    const { error: errReset } = await supabaseAdmin
      .from("passageiro_responsaveis")
      .update({ tipo: TipoResponsavel.ADICIONAL, updated_at: new Date().toISOString() })
      .eq("passageiro_id", passageiroId);

    if (errReset) throw errReset;

    const { error: errSet } = await supabaseAdmin
      .from("passageiro_responsaveis")
      .update({ tipo: TipoResponsavel.PRINCIPAL, updated_at: new Date().toISOString() })
      .eq("passageiro_id", passageiroId)
      .eq("responsavel_id", responsavelId);

    if (errSet) throw errSet;
    return true;
  }
};

export async function cleanupOrphanedResponsaveis(responsavelIds: string[]) {
  if (!responsavelIds || responsavelIds.length === 0) return;
  const uniqueIds = Array.from(new Set(responsavelIds.filter(Boolean)));

  for (const respId of uniqueIds) {
    const { count, error } = await supabaseAdmin
      .from("passageiro_responsaveis")
      .select("id", { count: "exact", head: true })
      .eq("responsavel_id", respId);

    if (!error && count === 0) {
      await supabaseAdmin
        .from("responsaveis")
        .delete()
        .eq("id", respId);
    }
  }
}

