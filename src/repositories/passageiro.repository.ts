import { supabaseAdmin } from "../config/supabase.js";
import { isValidFilterValue } from "../utils/filter.utils.js";

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
        veiculo:veiculos(*),
        responsaveis:passageiro_responsaveis_adicionais(*)
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
            responsaveis:passageiro_responsaveis_adicionais(*)
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

  async list(usuarioId: string, filtros?: { search?: string; escola?: string; veiculo?: string; periodo?: string; ativo?: string }) {
    let query = supabaseAdmin
      .from("passageiros")
      .select(`
            *,
            escola:escolas(id, nome),
            veiculo:veiculos(id, placa),
            contratos(id, status, created_at, minuta_url, contrato_final_url, token_acesso),
            responsaveis:passageiro_responsaveis_adicionais(*)
        `)
      .eq("usuario_id", usuarioId)
      .order("nome", { ascending: true });

    if (isValidFilterValue(filtros?.search)) {
      query = query.or(
        `nome.ilike.%${filtros.search}%,nome_responsavel.ilike.%${filtros.search}%`
      );
    }

    if (isValidFilterValue(filtros?.escola)) query = query.eq("escola_id", filtros.escola);
    if (isValidFilterValue(filtros?.veiculo)) query = query.eq("veiculo_id", filtros.veiculo);
    if (isValidFilterValue(filtros?.periodo)) query = query.eq("periodo", filtros.periodo.toLowerCase());
    if (isValidFilterValue(filtros?.ativo)) query = query.eq("ativo", filtros.ativo === "true");

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

  async lookupResponsavel(usuarioId: string, cpfLimpo: string) {
    return supabaseAdmin
      .from("passageiros")
      .select("nome_responsavel, telefone_responsavel, email_responsavel, parentesco_responsavel")
      .eq("usuario_id", usuarioId)
      .eq("cpf_responsavel", cpfLimpo)
      .limit(1)
      .maybeSingle();
  },

  async getResponsavelInfo(id: string) {
    return supabaseAdmin
      .from("passageiros")
      .select("cpf_responsavel, nome_responsavel, isento, nome")
      .eq("id", id)
      .single();
  },

  async listParaCobrancaAutomatica(usuarioId: string) {
    return supabaseAdmin
      .from("passageiros")
      .select("id, nome, valor_cobranca, dia_vencimento, cpf_responsavel, nome_responsavel, created_at, data_inicio_cobranca, data_fim_cobranca, isento")
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

  async insertResponsavelAdicional(data: Record<string, unknown>) {
    return supabaseAdmin
      .from("passageiro_responsaveis_adicionais")
      .insert([data])
      .select()
      .single();
  },

  async updateResponsavelAdicional(id: string, data: Record<string, unknown>) {
    return supabaseAdmin
      .from("passageiro_responsaveis_adicionais")
      .update(data)
      .eq("id", id)
      .select()
      .single();
  },

  async deleteResponsavelAdicional(id: string) {
    return supabaseAdmin
      .from("passageiro_responsaveis_adicionais")
      .delete()
      .eq("id", id);
  },

  async getResponsavelAdicionalById(id: string) {
    return supabaseAdmin
      .from("passageiro_responsaveis_adicionais")
      .select("*")
      .eq("id", id)
      .single();
  }
};
