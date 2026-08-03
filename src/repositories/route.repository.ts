import { supabaseAdmin } from "../config/supabase.js";
import { RouteExecutionStatus, RouteStopStatus } from "../types/enums.js";

export const routeRepository = {
  async insert(usuarioId: string, nome: string, veiculoId: string | null) {
    return supabaseAdmin
      .from("rotas")
      .insert([{
        usuario_id: usuarioId,
        nome,
        veiculo_id: veiculoId
      }])
      .select()
      .single();
  },

  async insertPassageiros(records: any[]) {
    return supabaseAdmin
      .from("rota_passageiros")
      .insert(records);
  },

  async update(id: string, data: any) {
    return supabaseAdmin
      .from("rotas")
      .update(data)
      .eq("id", id);
  },

  async delete(id: string) {
    return supabaseAdmin
      .from("rotas")
      .delete()
      .eq("id", id);
  },

  async getPassageirosByRotaId(rotaId: string) {
    return supabaseAdmin
      .from("rota_passageiros")
      .select("*")
      .eq("rota_id", rotaId);
  },

  async deletePassageiros(rotaId: string) {
    return supabaseAdmin
      .from("rota_passageiros")
      .delete()
      .eq("rota_id", rotaId);
  },

  async getById(id: string) {
    return supabaseAdmin
      .from("rotas")
      .select(`
        *,
        rota_passageiros (
          id,
          tipo_no,
          ordem,
          passageiro_id,
          escola_id,
          sentido,
          passageiro:passageiros (
            id,
            nome,
            nome_responsavel,
            parentesco_responsavel,
            telefone_responsavel,
            turma,
            logradouro,
            numero,
            bairro,
            cidade,
            ativo,
            escola:escolas (
              id,
              nome
            ),
            responsaveis:passageiro_responsaveis_adicionais!passageiro_id (
              id,
              nome,
              telefone,
              parentesco,
              logradouro,
              numero,
              bairro,
              cidade
            )
          ),
          escola:escolas (
            id,
            nome,
            logradouro,
            numero,
            bairro,
            cidade
          )
        )
      `)
      .eq("id", id)
      .maybeSingle();
  },

  async listByUsuario(usuarioId: string) {
    return supabaseAdmin
      .from("rotas")
      .select(`
        *,
        rota_passageiros (
          id,
          tipo_no,
          passageiro_id,
          escola_id
        ),
        veiculo:veiculos(
          id,
          placa,
          modelo,
          marca
        )
      `)
      .eq("usuario_id", usuarioId)
      .order("created_at", { ascending: false });
  },

  async listByUsuarioFallback(usuarioId: string) {
    return supabaseAdmin
      .from("rotas")
      .select("*")
      .eq("usuario_id", usuarioId)
      .order("created_at", { ascending: false });
  },

  async listExecucoesByUsuario(usuarioId: string) {
    return supabaseAdmin
      .from("execucoes_rota")
      .select(`
        *,
        rota:rotas (
          id,
          nome
        )
      `)
      .eq("usuario_id", usuarioId)
      .order("iniciada_em", { ascending: false });
  },

  async listExecucoesByUsuarioFallback(usuarioId: string) {
    return supabaseAdmin
      .from("execucoes_rota")
      .select("*")
      .eq("usuario_id", usuarioId)
      .order("iniciada_em", { ascending: false });
  },

  async getExecucaoDetail(id: string) {
    return supabaseAdmin
      .from("execucoes_rota")
      .select(`
        *,
        rota:rotas (
          id,
          nome
        ),
        execucoes_rota_passageiros (
          id,
          tipo_no,
          status,
          ordem,
          notificado_em,
          visitado_em,
          passageiro_id,
          escola_id,
          sentido,
          passageiro:passageiros (
            id,
            nome,
            nome_responsavel,
            parentesco_responsavel,
            telefone_responsavel,
            turma,
            logradouro,
            numero,
            bairro,
            cidade,
            ativo,
            escola:escolas (
              id,
              nome
            ),
            responsaveis:passageiro_responsaveis_adicionais!passageiro_id (
              id,
              nome,
              telefone,
              parentesco,
              logradouro,
              numero,
              bairro,
              cidade
            )
          ),
          escola:escolas (
            id,
            nome,
            logradouro,
            numero,
            bairro,
            cidade
          )
        )
      `)
      .eq("id", id)
      .maybeSingle();
  },

  async getExecucaoAtiva(usuarioId: string) {
    return supabaseAdmin
      .from("execucoes_rota")
      .select("id, rota:rotas(nome)")
      .eq("usuario_id", usuarioId)
      .eq("status", RouteExecutionStatus.INICIADA)
      .maybeSingle();
  },

  async insertExecucao(rotaId: string, usuarioId: string) {
    return supabaseAdmin
      .from("execucoes_rota")
      .insert([{
        rota_id: rotaId,
        usuario_id: usuarioId,
        status: RouteExecutionStatus.INICIADA
      }])
      .select()
      .single();
  },

  async insertExecucaoParadas(records: any[]) {
    return supabaseAdmin
      .from("execucoes_rota_passageiros")
      .insert(records);
  },

  async getExecucaoResumida(execucaoId: string) {
    return supabaseAdmin
      .from("execucoes_rota")
      .select("id, rota_id, status")
      .eq("id", execucaoId)
      .single();
  },

  async getParadaById(paradaId: string) {
    return supabaseAdmin
      .from("execucoes_rota_passageiros")
      .select("tipo_no, passageiro_id")
      .eq("id", paradaId)
      .single();
  },

  async getParadaAtualPendente(execucaoId: string) {
    return supabaseAdmin
      .from("execucoes_rota_passageiros")
      .select("id, tipo_no")
      .eq("execucao_rota_id", execucaoId)
      .eq("status", RouteStopStatus.PENDENTE)
      .order("ordem", { ascending: true })
      .limit(1);
  },

  async updateParadaStatus(paradaId: string, execucaoId: string, status: string, visitadoEm: string | null) {
    return supabaseAdmin
      .from("execucoes_rota_passageiros")
      .update({
        status,
        visitado_em: visitadoEm
      })
      .eq("id", paradaId)
      .eq("execucao_rota_id", execucaoId);
  },

  async updateTodasParadasDoPassageiroStatus(passageiroId: string, execucaoId: string, status: string, visitadoEm: string | null) {
    return supabaseAdmin
      .from("execucoes_rota_passageiros")
      .update({
        status,
        visitado_em: visitadoEm
      })
      .eq("passageiro_id", passageiroId)
      .eq("execucao_rota_id", execucaoId);
  },

  async getPendentes(execucaoId: string) {
    return supabaseAdmin
      .from("execucoes_rota_passageiros")
      .select("id")
      .eq("execucao_rota_id", execucaoId)
      .or(`status.eq.pendente,and(status.eq.embarcado,visitado_em.is.null)`);
  },

  async updateExecucaoStatus(execucaoId: string, status: RouteExecutionStatus, finalizadaEm: string | null) {
    return supabaseAdmin
      .from("execucoes_rota")
      .update({
        status,
        finalizada_em: finalizadaEm
      })
      .eq("id", execucaoId);
  },

  async updateParadaOrdem(paradaId: string, execucaoId: string, ordem: number) {
    return supabaseAdmin
      .from("execucoes_rota_passageiros")
      .update({ ordem })
      .eq("id", paradaId)
      .eq("execucao_rota_id", execucaoId);
  },

  async getAusenciasByRotaEData(rotaId: string, dataAusencia: string) {
    return supabaseAdmin
      .from("rota_ausencias")
      .select(`
        *,
        passageiro:passageiros (
          id,
          nome
        )
      `)
      .eq("rota_id", rotaId)
      .eq("data_ausencia", dataAusencia);
  },

  async getAusenciasByUsuarioEData(usuarioId: string, dataAusencia: string) {
    return supabaseAdmin
      .from("rota_ausencias")
      .select(`
        *,
        passageiro:passageiros (
          id,
          nome
        ),
        rota:rotas (
          id,
          nome
        )
      `)
      .eq("data_ausencia", dataAusencia);
  },

  async insertAusencia(record: any) {
    return supabaseAdmin
      .from("rota_ausencias")
      .insert([record])
      .select(`
        *,
        passageiro:passageiros (
          id,
          nome
        ),
        rota:rotas (
          id,
          nome
        )
      `)
      .single();
  },

  async deleteAusencia(id: string) {
    return supabaseAdmin
      .from("rota_ausencias")
      .delete()
      .eq("id", id);
  },

  async deleteAusenciaByPassageiroERota(passageiroId: string, rotaId: string, dataAusencia: string) {
    return supabaseAdmin
      .from("rota_ausencias")
      .delete()
      .eq("passageiro_id", passageiroId)
      .eq("rota_id", rotaId)
      .eq("data_ausencia", dataAusencia);
  }
};
