import { supabaseAdmin } from "../config/supabase.js";
import { RouteExecutionStatus, RouteStopStatus } from "../types/enums.js";
import { isValidFilterValue } from "../utils/filter.utils.js";
import { toPersistenceString, getNowBR } from "../utils/date.utils.js";

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

  async insertPassageiros(records: Record<string, unknown>[]) {
    return supabaseAdmin
      .from("rota_passageiros")
      .insert(records);
  },

  async update(id: string, data: Record<string, unknown>) {
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

  async getById(id: string, usuarioId?: string) {
    let query = supabaseAdmin
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
            turma,
            ativo,
            escola:escolas (
              id,
              nome
            ),
            responsaveis:passageiro_responsaveis!passageiro_id (
              id,
              tipo,
              parentesco,
              responsavel:responsaveis (
                id,
                nome,
                telefone,
                cpf,
                email,
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
      .eq("id", id);

    if (isValidFilterValue(usuarioId)) {
      query = query.eq("usuario_id", usuarioId);
    }

    return query.maybeSingle();
  },

  async listByUsuario(usuarioId: string, veiculoId?: string) {
    let query = supabaseAdmin
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
      .eq("usuario_id", usuarioId);

    if (isValidFilterValue(veiculoId)) {
      query = query.eq("veiculo_id", veiculoId);
    }

    return query.order("created_at", { ascending: false });
  },

  async listByUsuarioFallback(usuarioId: string, veiculoId?: string) {
    let query = supabaseAdmin
      .from("rotas")
      .select("*")
      .eq("usuario_id", usuarioId);

    if (isValidFilterValue(veiculoId)) {
      query = query.eq("veiculo_id", veiculoId);
    }

    return query.order("created_at", { ascending: false });
  },

  async listExecucoesByUsuario(usuarioId: string, veiculoId?: string, limit?: number, page: number = 1) {
    let query = supabaseAdmin
      .from("execucoes_rota")
      .select(`
        *,
        rota:rotas!inner (
          id,
          nome,
          veiculo_id,
          usuario_id,
          veiculo:veiculos (
            id,
            placa,
            modelo,
            marca
          )
        )
      `)
      .eq("rota.usuario_id", usuarioId);

    if (isValidFilterValue(veiculoId)) {
      query = query.eq("rota.veiculo_id", veiculoId);
    }

    query = query.order("iniciada_em", { ascending: false });

    if (limit && limit > 0) {
      const offset = (page - 1) * limit;
      query = query.range(offset, offset + limit - 1);
    }

    return query;
  },

  async listExecucoesByUsuarioFallback(usuarioId: string, limit?: number, page: number = 1) {
    let query = supabaseAdmin
      .from("execucoes_rota")
      .select(`
        *,
        rota:rotas!inner (
          id,
          nome,
          veiculo_id,
          usuario_id,
          veiculo:veiculos (
            id,
            placa,
            modelo,
            marca
          )
        )
      `)
      .eq("rota.usuario_id", usuarioId)
      .order("iniciada_em", { ascending: false });

    if (limit && limit > 0) {
      const offset = (page - 1) * limit;
      query = query.range(offset, offset + limit - 1);
    }

    return query;
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
            turma,
            ativo,
            escola:escolas (
              id,
              nome
            ),
            responsaveis:passageiro_responsaveis!passageiro_id (
              id,
              tipo,
              parentesco,
              responsavel:responsaveis (
                id,
                nome,
                telefone,
                cpf,
                email,
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

  async getExecucaoAtivaByRotaId(rotaId: string) {
    return supabaseAdmin
      .from("execucoes_rota")
      .select("id, rota_id, status, rota:rotas(nome)")
      .eq("rota_id", rotaId)
      .eq("status", RouteExecutionStatus.INICIADA)
      .maybeSingle();
  },

  async getExecucaoAtivaByVeiculoId(veiculoId: string) {
    return supabaseAdmin
      .from("execucoes_rota")
      .select("id, rota_id, status, rota:rotas!inner(nome, veiculo_id)")
      .eq("rota.veiculo_id", veiculoId)
      .eq("status", RouteExecutionStatus.INICIADA)
      .maybeSingle();
  },

  async insertExecucao(rotaId: string, usuarioId: string, notificarPais: boolean = true) {
    return supabaseAdmin
      .from("execucoes_rota")
      .insert([{
        rota_id: rotaId,
        usuario_id: usuarioId,
        status: RouteExecutionStatus.INICIADA,
        notificar_pais: notificarPais
      }])
      .select()
      .single();
  },

  async insertExecucaoParadas(records: Record<string, unknown>[]) {
    return supabaseAdmin
      .from("execucoes_rota_passageiros")
      .insert(records);
  },

  async getExecucaoResumida(execucaoId: string) {
    return supabaseAdmin
      .from("execucoes_rota")
      .select("id, rota_id, status, usuario_id, notificar_pais")
      .eq("id", execucaoId)
      .single();
  },

  async getParadaById(paradaId: string) {
    return supabaseAdmin
      .from("execucoes_rota_passageiros")
      .select("id, execucao_rota_id, tipo_no, passageiro_id, ordem, status, notificacao_a_caminho_enviada, notificacao_concluido_enviada")
      .eq("id", paradaId)
      .single();
  },

  async updateNotificacaoACaminhoEnviada(paradaId: string, enviada: boolean) {
    return supabaseAdmin
      .from("execucoes_rota_passageiros")
      .update({ notificacao_a_caminho_enviada: enviada })
      .eq("id", paradaId);
  },

  async updateNotificacaoConcluidoEnviada(paradaId: string, enviada: boolean) {
    return supabaseAdmin
      .from("execucoes_rota_passageiros")
      .update({ notificacao_concluido_enviada: enviada })
      .eq("id", paradaId);
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
      .eq("status", RouteStopStatus.PENDENTE);
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

  async updateParadasOrdemBatch(execucaoId: string, paradas: Array<{ id: string; ordem: number }>) {
    const payload = paradas.map((p) => ({
      id: p.id,
      execucao_rota_id: execucaoId,
      ordem: p.ordem,
    }));
    return supabaseAdmin
      .from("execucoes_rota_passageiros")
      .upsert(payload, { onConflict: "id" });
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
    let query = supabaseAdmin
      .from("rota_ausencias")
      .select(`
        *,
        passageiro:passageiros (
          id,
          nome
        ),
        rota:rotas!inner (
          id,
          nome,
          usuario_id
        )
      `)
      .eq("data_ausencia", dataAusencia);

    if (isValidFilterValue(usuarioId)) {
      query = query.or(`registrado_por.eq.${usuarioId},rota.usuario_id.eq.${usuarioId}`);
    }

    return query;
  },

  async insertAusencia(record: Record<string, unknown>) {
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

  async getAusenciaById(id: string) {
    return supabaseAdmin
      .from("rota_ausencias")
      .select("*")
      .eq("id", id)
      .maybeSingle();
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
  },

  async getAusenciasByPassageiro(passageiroId: string) {
    const todayStr = toPersistenceString(getNowBR());
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
      .eq("passageiro_id", passageiroId)
      .gte("data_ausencia", todayStr)
      .order("data_ausencia", { ascending: true });
  },

  async getRotasByPassageiro(passageiroId: string) {
    return supabaseAdmin
      .from("rota_passageiros")
      .select(`
        rota:rotas (*)
      `)
      .eq("passageiro_id", passageiroId);
  },

  async getRotaNomeById(rotaId: string) {
    return supabaseAdmin
      .from("rotas")
      .select("nome")
      .eq("id", rotaId)
      .single();
  },

  async getAusenciaExistenteById(ausenciaId: string) {
    return supabaseAdmin
      .from("rota_ausencias")
      .select("id, rota_id, data_ausencia, rota:rotas(nome)")
      .eq("id", ausenciaId)
      .single();
  }
};
