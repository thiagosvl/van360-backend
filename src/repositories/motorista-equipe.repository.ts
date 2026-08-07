import { supabaseAdmin } from "../config/supabase.js";
import { CreateMembroEquipeDTO, UpdateMembroEquipeDTO } from "../types/dtos/motorista-equipe.dto.js";
import { isValidFilterValue } from "../utils/filter.utils.js";

export const motoristaEquipeRepository = {
  async listByGestor(gestorId: string, veiculoIdFilter?: string) {
    let query = supabaseAdmin
      .from("usuarios")
      .select("id, nome, apelido, razao_social, email, telefone, cpfcnpj, tipo, ativo, conta_pai_id, veiculo_id, created_at, veiculos:veiculo_id(id, placa, marca, modelo)")
      .eq("conta_pai_id", gestorId)
      .order("created_at", { ascending: false });

    if (isValidFilterValue(veiculoIdFilter)) {
      query = query.eq("veiculo_id", veiculoIdFilter);
    }

    return query;
  },

  async getById(id: string, gestorId: string) {
    return supabaseAdmin
      .from("usuarios")
      .select("id, nome, apelido, razao_social, email, telefone, cpfcnpj, tipo, ativo, conta_pai_id, veiculo_id, created_at, veiculos:veiculo_id(id, placa, marca, modelo)")
      .eq("id", id)
      .eq("conta_pai_id", gestorId)
      .single();
  },

  async createProfile(data: {
    id: string;
    nome: string;
    apelido?: string;
    razao_social?: string;
    email: string;
    telefone: string;
    cpfcnpj?: string;
    tipo: string;
    conta_pai_id: string;
    veiculo_id: string;
    data_nascimento?: string;
  }) {
    return supabaseAdmin
      .from("usuarios")
      .insert([{
        id: data.id,
        nome: data.nome,
        apelido: data.apelido || null,
        razao_social: data.razao_social || null,
        email: data.email,
        telefone: data.telefone,
        cpfcnpj: data.cpfcnpj || "",
        tipo: data.tipo,
        conta_pai_id: data.conta_pai_id,
        veiculo_id: data.veiculo_id,
        data_nascimento: data.data_nascimento || "2000-01-01",
        ativo: true
      }])
      .select()
      .single();
  },

  async updateProfile(id: string, gestorId: string, data: UpdateMembroEquipeDTO) {
    const payload: Record<string, unknown> = {};
    if (data.nome !== undefined) payload.nome = data.nome;
    if (data.apelido !== undefined) payload.apelido = data.apelido;
    if (data.razao_social !== undefined) payload.razao_social = data.razao_social;
    if (data.telefone !== undefined) payload.telefone = data.telefone;
    if (data.cpf !== undefined) payload.cpfcnpj = data.cpf;
    if (data.tipo !== undefined) payload.tipo = data.tipo;
    if (data.veiculo_id !== undefined) payload.veiculo_id = data.veiculo_id;
    if (data.ativo !== undefined) payload.ativo = data.ativo;
    payload.updated_at = new Date().toISOString();

    return supabaseAdmin
      .from("usuarios")
      .update(payload)
      .eq("id", id)
      .eq("conta_pai_id", gestorId)
      .select()
      .single();
  },

  async softDelete(id: string, gestorId: string) {
    return supabaseAdmin
      .from("usuarios")
      .update({ ativo: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("conta_pai_id", gestorId)
      .select()
      .single();
  },

  async reassignRecordsToGestor(memberId: string, gestorId: string) {
    // 1. Transferir Gastos
    await supabaseAdmin
      .from("gastos")
      .update({ usuario_id: gestorId })
      .eq("usuario_id", memberId);

    // 2. Transferir Execuções de Rota
    await supabaseAdmin
      .from("execucoes_rota")
      .update({ usuario_id: gestorId })
      .eq("usuario_id", memberId);

    // 3. Transferir Presenças em Execuções de Rota
    await supabaseAdmin
      .from("execucoes_rota_passageiros")
      .update({ registrado_por: gestorId })
      .eq("registrado_por", memberId);

    // 4. Transferir Rota Ausências
    await supabaseAdmin
      .from("rota_ausencias")
      .update({ criado_por: gestorId })
      .eq("criado_por", memberId);
  },

  async hardDeleteProfile(id: string, gestorId: string) {
    return supabaseAdmin
      .from("usuarios")
      .delete()
      .eq("id", id)
      .eq("conta_pai_id", gestorId);
  }
};
