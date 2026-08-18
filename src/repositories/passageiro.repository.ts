import { supabaseAdmin } from "../config/supabase.js";
import { isValidFilterValue } from "../utils/filter.utils.js";
import { TipoResponsavel } from "../types/enums.js";
import { ListPassageirosFiltersDTO } from "../types/dtos/passageiro.dto.js";

const PASSAGEIRO_RESPONSAVEIS_SELECT = `
  responsaveis:passageiro_responsaveis(
    id,
    tipo,
    parentesco,
    created_at,
    responsavel:responsaveis(
      id,
      nome,
      telefone,
      cpf,
      email,
      pin_acesso,
      logradouro,
      numero,
      bairro,
      cidade,
      estado,
      cep,
      referencia,
      complemento
    )
  )
`;

export const passageiroRepository = {
  /**
   * Retorna os dados completos do passageiro, incluindo relacionamentos
   * frequentemente utilizados (escola, veiculo, responsaveis via pivô).
   */
  async getByIdCompleto(id: string, usuarioId?: string) {
    let query = supabaseAdmin
      .from("passageiros")
      .select(`
        *,
        escola:escolas(*),
        veiculo:veiculos(*),
        ${PASSAGEIRO_RESPONSAVEIS_SELECT}
      `)
      .eq("id", id);

    if (isValidFilterValue(usuarioId)) {
      query = query.eq("usuario_id", usuarioId);
    }

    const { data, error } = await query.single();
    if (error) throw error;
    return data;
  },

  async insert(data: Record<string, unknown>) {
    return supabaseAdmin
      .from("passageiros")
      .insert([data])
      .select()
      .single();
  },

  async update(id: string, data: Record<string, unknown>) {
    return supabaseAdmin
      .from("passageiros")
      .update(data)
      .eq("id", id)
      .select()
      .single();
  },

  async delete(id: string) {
    return supabaseAdmin.from("passageiros").delete().eq("id", id);
  },

  async getSummaryForDashboard(usuarioId: string, veiculoId?: string) {
    let query = supabaseAdmin.from("passageiros").select("id, ativo, isento, valor_cobranca, dia_vencimento, data_inicio_cobranca, data_fim_cobranca, created_at").eq("usuario_id", usuarioId);
    if (isValidFilterValue(veiculoId)) {
      query = query.eq("veiculo_id", veiculoId);
    }
    return query;
  },

  async getById(id: string, usuarioId?: string) {
    let query = supabaseAdmin
      .from("passageiros")
      .select(`
            *,
            escola:escolas(id, nome),
            veiculo:veiculos(id, placa, modelo),
            contratos(id, status, created_at, minuta_url, contrato_final_url, token_acesso),
            ${PASSAGEIRO_RESPONSAVEIS_SELECT}
        `)
      .eq("id", id);

    if (isValidFilterValue(usuarioId)) {
      query = query.eq("usuario_id", usuarioId);
    }

    return query
      .order('created_at', { foreignTable: 'contratos', ascending: false })
      .limit(1, { foreignTable: 'contratos' })
      .single();
  },

  async list(usuarioId: string, filtros?: ListPassageirosFiltersDTO) {
    const hasPagination = Boolean((filtros?.page && filtros.page > 0) || (filtros?.limit && filtros.limit > 0));
    const page = filtros?.page && filtros.page > 0 ? Math.floor(filtros.page) : 1;
    const limit = filtros?.limit && filtros.limit > 0 ? Math.floor(filtros.limit) : 50;

    let query = supabaseAdmin
      .from("passageiros")
      .select(`
        id, usuario_id, nome, ativo, isento, valor_cobranca, dia_vencimento, data_inicio_cobranca, data_fim_cobranca, data_inicio_transporte, data_fim_transporte, periodo, turma, escola_id, veiculo_id, created_at,
        escola:escolas(id, nome),
        veiculo:veiculos(id, placa, modelo),
        contratos(id, status, token_acesso),
        responsaveis:passageiro_responsaveis(
          id, tipo, parentesco,
          responsavel:responsaveis(id, nome, telefone, cpf, email, logradouro, numero, bairro, cidade, estado, cep, referencia, complemento)
        )
      `, hasPagination ? { count: "exact" } : undefined)
      .eq("usuario_id", usuarioId)
      .order("nome", { ascending: true })
      .order("created_at", { foreignTable: "contratos", ascending: false })
      .limit(1, { foreignTable: "contratos" });

    if (isValidFilterValue(filtros?.search)) {
      const sanitizedSearch = filtros.search.replace(/[,()%\\]/g, "").trim();
      if (sanitizedSearch) {
        query = query.or(`nome.ilike.%${sanitizedSearch}%`);
      }
    }

    if (isValidFilterValue(filtros?.escola)) query = query.eq("escola_id", filtros.escola);
    if (isValidFilterValue(filtros?.veiculo)) query = query.eq("veiculo_id", filtros.veiculo);
    if (isValidFilterValue(filtros?.periodo)) query = query.eq("periodo", filtros.periodo.toLowerCase());

    const rawAtivo = filtros?.ativo ?? filtros?.status;
    if (isValidFilterValue(rawAtivo)) {
      const isAtivoBool = rawAtivo === "true" || rawAtivo === "ativo";
      query = query.eq("ativo", isAtivoBool);
    }

    if (hasPagination) {
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);
    }

    return query;
  },

  async updateAtivo(id: string, ativo: boolean) {
    return supabaseAdmin
      .from("passageiros")
      .update({ ativo })
      .eq("id", id);
  },

  async getUsuarioIdAndNome(id: string) {
    return supabaseAdmin
      .from("passageiros")
      .select("usuario_id, nome")
      .eq("id", id)
      .single();
  },

  async countByUsuario(usuarioId: string, filtros?: { ativo?: string; veiculo?: string }) {
    let query = supabaseAdmin
      .from("passageiros")
      .select("id", { count: "exact", head: true })
      .eq("usuario_id", usuarioId);

    if (isValidFilterValue(filtros?.ativo)) query = query.eq("ativo", filtros.ativo === "true");
    if (isValidFilterValue(filtros?.veiculo)) query = query.eq("veiculo_id", filtros.veiculo);

    return query;
  },

  async lookupResponsavel(usuarioId: string, termoLimpo: string) {
    let query = supabaseAdmin
      .from("responsaveis")
      .select("id, nome, telefone, email, cpf, logradouro, numero, bairro, cidade, estado, cep, referencia, complemento");

    if (termoLimpo.length === 11) {
      query = query.or(`cpf.eq.${termoLimpo},telefone.eq.${termoLimpo}`);
    } else if (termoLimpo.length === 10) {
      query = query.eq("telefone", termoLimpo);
    } else {
      return { data: null, error: null };
    }

    const { data: responsavel, error } = await query.limit(1).maybeSingle();

    if (error || !responsavel) return { data: null, error };
    return {
      data: {
        id: responsavel.id,
        nome: responsavel.nome,
        telefone: responsavel.telefone,
        email: responsavel.email,
        cpf: responsavel.cpf,
        logradouro: responsavel.logradouro,
        numero: responsavel.numero,
        bairro: responsavel.bairro,
        cidade: responsavel.cidade,
        estado: responsavel.estado,
        cep: responsavel.cep,
        referencia: responsavel.referencia,
        complemento: responsavel.complemento,
      },
      error: null
    };
  },

  async getResponsavelInfo(id: string) {
    const { data, error } = await supabaseAdmin
      .from("passageiros")
      .select(`
        id, nome, isento,
        ${PASSAGEIRO_RESPONSAVEIS_SELECT}
      `)
      .eq("id", id)
      .single();

    if (error) throw error;

    const respLink = (data.responsaveis as any[])?.find((r: any) => r.tipo === TipoResponsavel.PRINCIPAL) || (data.responsaveis as any[])?.[0];
    const resp = Array.isArray(respLink?.responsavel) ? respLink.responsavel[0] : (respLink?.responsavel || null);

    return {
      id: data.id,
      nome: data.nome,
      isento: data.isento,
      responsavel_principal: resp?.id ? {
        id: resp.id,
        nome: resp.nome || null,
        cpf: resp.cpf || null,
        telefone: resp.telefone || null,
        email: resp.email || null,
        parentesco: respLink?.parentesco || null,
        logradouro: resp.logradouro || null,
        numero: resp.numero || null,
        bairro: resp.bairro || null,
        cidade: resp.cidade || null,
        estado: resp.estado || null,
        cep: resp.cep || null,
        referencia: resp.referencia || null,
        complemento: resp.complemento || null,
      } : null
    };
  },

  async listParaCobrancaAutomatica(usuarioId: string) {
    return supabaseAdmin
      .from("passageiros")
      .select(`
        id, nome, valor_cobranca, dia_vencimento, created_at, data_inicio_cobranca, data_fim_cobranca, isento,
        ${PASSAGEIRO_RESPONSAVEIS_SELECT}
      `)
      .eq("usuario_id", usuarioId)
      .eq("ativo", true)
      .eq("enviar_notificacoes", true)
      .or("isento.eq.false,isento.is.null");
  },

  async listAniversariantesInfo(usuarioId: string, veiculoId?: string) {
    let query = supabaseAdmin
      .from("passageiros")
      .select(`
        id, 
        nome, 
        data_nascimento,
        veiculo:veiculos(id, placa, modelo),
        escola:escolas(id, nome)
      `)
      .eq("usuario_id", usuarioId)
      .eq("ativo", true);

    if (isValidFilterValue(veiculoId)) {
      query = query.eq("veiculo_id", veiculoId);
    }

    return query.order("nome", { ascending: true });
  },

  /**
   * Procura ou insere responsável na tabela central responsaveis
   */
  async upsertResponsavel(data: {
    telefone: string;
    nome: string;
    cpf?: string | null;
    email?: string | null;
    pin_acesso?: string | null;
    logradouro?: string | null;
    numero?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    estado?: string | null;
    cep?: string | null;
    referencia?: string | null;
    complemento?: string | null;
  }) {
    const { data: existing } = await supabaseAdmin
      .from("responsaveis")
      .select("*")
      .eq("telefone", data.telefone)
      .maybeSingle();

    if (existing) {
      const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() };
      if (data.nome) updatePayload.nome = data.nome;
      if (data.cpf !== undefined) updatePayload.cpf = data.cpf;
      if (data.email !== undefined) updatePayload.email = data.email;
      if (data.pin_acesso !== undefined) updatePayload.pin_acesso = data.pin_acesso;
      if (data.logradouro !== undefined) updatePayload.logradouro = data.logradouro;
      if (data.numero !== undefined) updatePayload.numero = data.numero;
      if (data.bairro !== undefined) updatePayload.bairro = data.bairro;
      if (data.cidade !== undefined) updatePayload.cidade = data.cidade;
      if (data.estado !== undefined) updatePayload.estado = data.estado;
      if (data.cep !== undefined) updatePayload.cep = data.cep;
      if (data.referencia !== undefined) updatePayload.referencia = data.referencia;
      if (data.complemento !== undefined) updatePayload.complemento = data.complemento;

      const { data: updated, error } = await supabaseAdmin
        .from("responsaveis")
        .update(updatePayload)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      return updated;
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("responsaveis")
      .insert([{
        telefone: data.telefone,
        nome: data.nome,
        cpf: data.cpf || null,
        email: data.email || null,
        pin_acesso: data.pin_acesso || null,
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
    return inserted;
  },

  /**
   * Vincula responsável a um passageiro na pivô passageiro_responsaveis
   */
  async linkPassageiroResponsavel(passageiroId: string, responsavelId: string, tipo: string = TipoResponsavel.PRINCIPAL, parentesco?: string | null) {
    if (tipo === TipoResponsavel.PRINCIPAL) {
      await supabaseAdmin
        .from("passageiro_responsaveis")
        .update({ tipo: TipoResponsavel.ADICIONAL, updated_at: new Date().toISOString() })
        .eq("passageiro_id", passageiroId)
        .eq("tipo", TipoResponsavel.PRINCIPAL);
    }

    const { data: link, error } = await supabaseAdmin
      .from("passageiro_responsaveis")
      .upsert({
        passageiro_id: passageiroId,
        responsavel_id: responsavelId,
        tipo,
        parentesco: parentesco !== undefined ? (parentesco || null) : undefined,
        updated_at: new Date().toISOString()
      }, { onConflict: "passageiro_id,responsavel_id" })
      .select()
      .single();

    if (error) throw error;
    return link;
  },

  async removePassageiroResponsavelLink(passageiroId: string, responsavelId: string) {
    const { error } = await supabaseAdmin
      .from("passageiro_responsaveis")
      .delete()
      .eq("passageiro_id", passageiroId)
      .eq("responsavel_id", responsavelId);

    if (error) throw error;
    const { cleanupOrphanedResponsaveis: cleanup } = await import("./responsavel.repository.js");
    await cleanup([responsavelId]);
    return true;
  },

  async insertResponsavelAdicional(data: Record<string, any>) {
    return this.upsertResponsavel({
      telefone: String(data.telefone || "").replace(/\D/g, ""),
      nome: data.nome,
      cpf: data.cpf,
      email: data.email,
      logradouro: data.logradouro,
      numero: data.numero,
      bairro: data.bairro,
      cidade: data.cidade,
      estado: data.estado,
      cep: data.cep,
      referencia: data.referencia,
      complemento: data.complemento,
    });
  },

  async updateResponsavelAdicional(id: string, data: Record<string, any>) {
    const { data: updated, error } = await supabaseAdmin
      .from("responsaveis")
      .update(data)
      .eq("id", id)
      .select()
      .single();
    return { data: updated, error };
  },

  async deleteResponsavelAdicional(id: string, passageiroId?: string) {
    const { responsavelRepository } = await import("./responsavel.repository.js");
    await responsavelRepository.deleteResponsavelAdicional(id, passageiroId);
    return { error: null };
  },

  async getResponsavelAdicionalById(id: string) {
    const { data, error } = await supabaseAdmin
      .from("responsaveis")
      .select("*")
      .eq("id", id)
      .single();
    return { data, error };
  }
};

