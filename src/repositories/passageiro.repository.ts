import { supabaseAdmin } from "../config/supabase.js";

export const passageiroRepository = {
  /**
   * Retorna os dados completos do passageiro, incluindo relacionamentos
   * frequentemente utilizados (escola, veiculo).
   * Se chamado por diferentes services (ex: geração de contrato, notificação, etc),
   * garantimos que todos os dados essenciais estão presentes.
   */
  async getByIdCompleto(id: string, usuarioId?: string) {
    let query = supabaseAdmin
      .from("passageiros")
      .select(`
        *,
        escola:escolas(*),
        veiculo:veiculos(*)
      `)
      .eq("id", id);

    if (usuarioId) {
      query = query.eq("usuario_id", usuarioId);
    }

    const { data, error } = await query.single();
    if (error) throw error;
    return data;
  },

  async insert(data: any) {
    return supabaseAdmin
        .from("passageiros")
        .insert([data])
        .select()
        .single();
  },

  async update(id: string, data: any) {
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

  async getSummaryForDashboard(usuarioId: string) {
    return supabaseAdmin.from("passageiros").select("id, ativo").eq("usuario_id", usuarioId);
  },

  async getById(id: string) {
    return supabaseAdmin
        .from("passageiros")
        .select(`
            *,
            escola:escolas(id, nome),
            veiculo:veiculos(id, placa, modelo),
            contratos(id, status, created_at, minuta_url, contrato_final_url, token_acesso)
        `)
        .eq("id", id)
        .order('created_at', { foreignTable: 'contratos', ascending: false })
        .limit(1, { foreignTable: 'contratos' })
        .single();
  },

  async list(usuarioId: string, filtros?: any) {
    let query = supabaseAdmin
        .from("passageiros")
        .select(`
            *,
            escola:escolas(id, nome),
            veiculo:veiculos(id, placa),
            contratos(id, status, created_at, minuta_url, contrato_final_url, token_acesso)
        `)
        .eq("usuario_id", usuarioId)
        .order("nome", { ascending: true });

    if (filtros?.search) {
        query = query.or(
            `nome.ilike.%${filtros.search}%,nome_responsavel.ilike.%${filtros.search}%`
        );
    }

    if (filtros?.escola) query = query.eq("escola_id", filtros.escola);
    if (filtros?.veiculo) query = query.eq("veiculo_id", filtros.veiculo);
    if (filtros?.ativo !== undefined) query = query.eq("ativo", filtros.ativo === "true");

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

  async countByUsuario(usuarioId: string, filtros?: any) {
    let query = supabaseAdmin
        .from("passageiros")
        .select("id", { count: "exact", head: true })
        .eq("usuario_id", usuarioId);

    if (filtros?.ativo !== undefined) query = query.eq("ativo", filtros.ativo === "true");

    return query;
  },

  async countCobrancas(passageiroId: string) {
    return supabaseAdmin
        .from("cobrancas")
        .select("id", { count: "exact", head: true })
        .eq("passageiro_id", passageiroId);
  },

  async lookupResponsavel(usuarioId: string, cpfLimpo: string) {
    return supabaseAdmin
        .from("passageiros")
        .select("nome_responsavel, email_responsavel, telefone_responsavel")
        .eq("usuario_id", usuarioId)
        .eq("cpf_responsavel", cpfLimpo)
        .limit(1)
        .maybeSingle();
  },

  async getResponsavelInfo(id: string) {
    return supabaseAdmin
      .from("passageiros")
      .select("cpf_responsavel, nome_responsavel")
      .eq("id", id)
      .single();
  },

  async listParaCobrancaAutomatica(usuarioId: string) {
    return supabaseAdmin
      .from("passageiros")
      .select("id, nome, valor_cobranca, dia_vencimento, cpf_responsavel, nome_responsavel")
      .eq("usuario_id", usuarioId)
      .eq("ativo", true)
      .eq("enviar_notificacoes", true);
  }
};
