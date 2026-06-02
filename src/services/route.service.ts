import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import { CreateRouteDTO, UpdateRouteDTO } from "../types/dtos/route.dto.js";
import { notificationService } from "./notifications/notification.service.js";
import { RouteExecutionStatus, RouteStopStatus } from "../types/enums.js";
import {
  EVENTO_ROTA_A_CAMINHO_IDA,
  EVENTO_ROTA_A_CAMINHO_VOLTA,
  EVENTO_ROTA_EMBARCOU,
  EVENTO_ROTA_DESEMBARCOU
} from "../config/constants.js";

const createRoute = async (data: CreateRouteDTO): Promise<any> => {
  if (!data.usuario_id) throw new AppError("Usuário obrigatório", 400);
  if (!data.nome) throw new AppError("Nome da rota é obrigatório", 400);

  const { data: inserted, error } = await supabaseAdmin
    .from("rotas")
    .insert([{
      usuario_id: data.usuario_id,
      nome: data.nome,
      periodo: data.periodo,
      tipo: data.tipo
    }])
    .select()
    .single();

  if (error) throw error;

  if (data.passageiros && data.passageiros.length > 0) {
    const records = data.passageiros.map(p => ({
      rota_id: inserted.id,
      passageiro_id: p.passageiro_id,
      ordem: p.ordem
    }));

    const { error: assocError } = await supabaseAdmin
      .from("rota_passageiros")
      .insert(records);

    if (assocError) throw assocError;
  }

  return await getRoute(inserted.id);
};

const updateRoute = async (id: string, data: UpdateRouteDTO): Promise<any> => {
  if (!id) throw new AppError("ID da rota é obrigatório", 400);

  const updatePayload: any = {};
  if (data.nome !== undefined) updatePayload.nome = data.nome;
  if (data.periodo !== undefined) updatePayload.periodo = data.periodo;
  if (data.tipo !== undefined) updatePayload.tipo = data.tipo;

  if (Object.keys(updatePayload).length > 0) {
    const { error } = await supabaseAdmin
      .from("rotas")
      .update(updatePayload)
      .eq("id", id);

    if (error) throw error;
  }

  if (data.passageiros !== undefined) {
    const { error: deleteError } = await supabaseAdmin
      .from("rota_passageiros")
      .delete()
      .eq("rota_id", id);

    if (deleteError) throw deleteError;

    if (data.passageiros && data.passageiros.length > 0) {
      const records = data.passageiros.map(p => ({
        rota_id: id,
        passageiro_id: p.passageiro_id,
        ordem: p.ordem
      }));

      const { error: insertError } = await supabaseAdmin
        .from("rota_passageiros")
        .insert(records);

      if (insertError) throw insertError;
    }
  }

  return await getRoute(id);
};

const deleteRoute = async (id: string): Promise<void> => {
  if (!id) throw new AppError("ID da rota é obrigatório", 400);

  const { error } = await supabaseAdmin
    .from("rotas")
    .delete()
    .eq("id", id);

  if (error) throw error;
};

const getRoute = async (id: string): Promise<any> => {
  const { data: route, error } = await supabaseAdmin
    .from("rotas")
    .select(`
      *,
      rota_passageiros (
        id,
        ordem,
        passageiro:passageiros (
          id,
          nome,
          nome_responsavel,
          telefone_responsavel,
          logradouro,
          numero,
          bairro,
          cidade,
          ativo,
          escola:escolas (
            id,
            nome
          )
        )
      )
    `)
    .eq("id", id)
    .single();

  if (error) throw error;

  if (route.rota_passageiros) {
    route.passageiros = route.rota_passageiros
      .map((rp: any) => ({
        ...rp.passageiro,
        ordem: rp.ordem,
        rota_passageiro_id: rp.id
      }))
      .sort((a: any, b: any) => a.ordem - b.ordem);
    
    delete route.rota_passageiros;
  } else {
    route.passageiros = [];
  }

  return route;
};

const listRoutesByUsuario = async (usuarioId: string): Promise<any[]> => {
  if (!usuarioId) throw new AppError("ID do usuário é obrigatório", 400);

  const { data: routes, error } = await supabaseAdmin
    .from("rotas")
    .select(`
      *,
      rota_passageiros (
        id,
        ordem,
        passageiro_id
      )
    `)
    .eq("usuario_id", usuarioId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (routes || []).map((route: any) => {
    const count = route.rota_passageiros ? route.rota_passageiros.length : 0;
    delete route.rota_passageiros;
    return {
      ...route,
      numero_passageiros: count
    };
  });
};

const listExecucoesByUsuario = async (usuarioId: string): Promise<any[]> => {
  if (!usuarioId) throw new AppError("ID do usuário é obrigatório", 400);

  const { data: execs, error } = await supabaseAdmin
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

  if (error) throw error;
  return execs || [];
};

const getExecucaoDetail = async (id: string): Promise<any> => {
  const { data: exec, error } = await supabaseAdmin
    .from("execucoes_rota")
    .select(`
      *,
      rota:rotas (
        id,
        nome
      ),
      execucoes_rota_passageiros (
        id,
        status,
        ordem,
        notificado_em,
        visitado_em,
        passageiro_id,
        passageiro:passageiros (
          id,
          nome,
          nome_responsavel,
          telefone_responsavel,
          logradouro,
          numero,
          bairro,
          cidade,
          latitude,
          longitude,
          escola:escolas (
            id,
            nome
          )
        )
      )
    `)
    .eq("id", id)
    .single();

  if (error) throw error;

  if (exec.execucoes_rota_passageiros) {
    exec.paradas = exec.execucoes_rota_passageiros
      .map((erp: any) => ({
        ...erp.passageiro,
        passageiro_id: erp.passageiro_id,
        status: erp.status,
        ordem: erp.ordem,
        notificado_em: erp.notificado_em,
        visitado_em: erp.visitado_em,
        execucao_passageiro_id: erp.id
      }))
      .sort((a: any, b: any) => a.ordem - b.ordem);
    
    delete exec.execucoes_rota_passageiros;
  } else {
    exec.paradas = [];
  }

  return exec;
};

const iniciarRota = async (rotaId: string, usuarioId: string): Promise<any> => {
  if (!rotaId) throw new AppError("ID da rota é obrigatório", 400);
  if (!usuarioId) throw new AppError("ID do usuário é obrigatório", 400);

  const { data: activeExec, error: checkError } = await supabaseAdmin
    .from("execucoes_rota")
    .select("id")
    .eq("usuario_id", usuarioId)
    .eq("status", RouteExecutionStatus.INICIADA)
    .maybeSingle();

  if (checkError) throw checkError;
  if (activeExec) {
    throw new AppError("Já existe uma rota ativa em andamento. Finalize-a antes de iniciar outra.", 400);
  }

  const route = await getRoute(rotaId);
  if (!route) throw new AppError("Rota não encontrada", 404);
  if (!route.passageiros || route.passageiros.length === 0) {
    throw new AppError("A rota selecionada não possui passageiros cadastrados.", 400);
  }

  const { data: exec, error: execError } = await supabaseAdmin
    .from("execucoes_rota")
    .insert([{
      rota_id: rotaId,
      usuario_id: usuarioId,
      status: RouteExecutionStatus.INICIADA,
      tipo: route.tipo
    }])
    .select()
    .single();

  if (execError) throw execError;

  const paradasRecords = route.passageiros.map((p: any) => ({
    execucao_rota_id: exec.id,
    passageiro_id: p.id,
    ordem: p.ordem,
    status: RouteStopStatus.PENDENTE
  }));

  const { error: paradasError } = await supabaseAdmin
    .from("execucoes_rota_passageiros")
    .insert(paradasRecords);

  if (paradasError) throw paradasError;

  await avancarProximoPassageiro(exec.id);

  return await getExecucaoDetail(exec.id);
};

const avancarProximoPassageiro = async (execucaoId: string): Promise<any> => {
  const { data: exec, error: execError } = await supabaseAdmin
    .from("execucoes_rota")
    .select("id, status, tipo, usuario_id")
    .eq("id", execucaoId)
    .single();

  if (execError) throw execError;
  if (exec.status !== RouteExecutionStatus.INICIADA) return await getExecucaoDetail(execucaoId);

  const { data: paradas, error: paradasError } = await supabaseAdmin
    .from("execucoes_rota_passageiros")
    .select("id, status, ordem, passageiro_id")
    .eq("execucao_rota_id", execucaoId)
    .order("ordem", { ascending: true });

  if (paradasError) throw paradasError;

  const proximo = (paradas || []).find((p: any) => p.status === RouteStopStatus.PENDENTE);

  if (!proximo) {
    const { error: updateExecError } = await supabaseAdmin
      .from("execucoes_rota")
      .update({
        status: RouteExecutionStatus.CONCLUIDA,
        finalizada_em: new Date().toISOString()
      })
      .eq("id", execucaoId);

    if (updateExecError) throw updateExecError;
    return await getExecucaoDetail(execucaoId);
  }

  const { error: updateParadaError } = await supabaseAdmin
    .from("execucoes_rota_passageiros")
    .update({ status: RouteStopStatus.A_CAMINHO })
    .eq("id", proximo.id);

  if (updateParadaError) throw updateParadaError;

  const { data: passData, error: passError } = await supabaseAdmin
    .from("passageiros")
    .select("nome, nome_responsavel, telefone_responsavel")
    .eq("id", proximo.passageiro_id)
    .single();

  if (passError) throw passError;

  const { data: motorista, error: motError } = await supabaseAdmin
    .from("usuarios")
    .select("nome, apelido, telefone")
    .eq("id", exec.usuario_id)
    .single();

  if (motError) throw motError;

  if (passData.telefone_responsavel) {
    const evento = exec.tipo === "ida" ? EVENTO_ROTA_A_CAMINHO_IDA : EVENTO_ROTA_A_CAMINHO_VOLTA;
    await notificationService.notifyRoute(
      passData.telefone_responsavel,
      evento,
      {
        nomeResponsavel: passData.nome_responsavel || "Responsável",
        nomePassageiro: passData.nome || "Passageiro",
        nomeMotorista: motorista.nome,
        apelidoMotorista: motorista.apelido,
        telefoneMotorista: motorista.telefone
      }
    );

    await supabaseAdmin
      .from("execucoes_rota_passageiros")
      .update({ notificado_em: new Date().toISOString() })
      .eq("id", proximo.id);
  }

  return await getExecucaoDetail(execucaoId);
};

const atualizarParadaStatus = async (
  execucaoId: string,
  passageiroId: string,
  novoStatus: RouteStopStatus.EMBARCADO | RouteStopStatus.AUSENTE
): Promise<any> => {
  if (!execucaoId) throw new AppError("ID da execução é obrigatório", 400);
  if (!passageiroId) throw new AppError("ID do passageiro é obrigatório", 400);

  const { data: exec, error: execError } = await supabaseAdmin
    .from("execucoes_rota")
    .select("id, tipo, usuario_id, status")
    .eq("id", execucaoId)
    .single();

  if (execError) throw execError;
  if (exec.status !== RouteExecutionStatus.INICIADA) {
    throw new AppError("A rota selecionada não está ativa.", 400);
  }

  const { data: parada, error: paradaError } = await supabaseAdmin
    .from("execucoes_rota_passageiros")
    .select("id, status")
    .eq("execucao_rota_id", execucaoId)
    .eq("passageiro_id", passageiroId)
    .single();

  if (paradaError) throw paradaError;

  const { error: updateError } = await supabaseAdmin
    .from("execucoes_rota_passageiros")
    .update({
      status: novoStatus,
      visitado_em: new Date().toISOString()
    })
    .eq("id", parada.id);

  if (updateError) throw updateError;

  if (novoStatus === RouteStopStatus.EMBARCADO) {
    const { data: passData, error: passError } = await supabaseAdmin
      .from("passageiros")
      .select("nome, nome_responsavel, telefone_responsavel")
      .eq("id", passageiroId)
      .single();

    if (passError) throw passError;

    const { data: motorista, error: motError } = await supabaseAdmin
      .from("usuarios")
      .select("nome, apelido, telefone")
      .eq("id", exec.usuario_id)
      .single();

    if (motError) throw motError;

    if (passData.telefone_responsavel) {
      const evento = exec.tipo === "ida" ? EVENTO_ROTA_EMBARCOU : EVENTO_ROTA_DESEMBARCOU;
      await notificationService.notifyRoute(
        passData.telefone_responsavel,
        evento,
        {
          nomeResponsavel: passData.nome_responsavel || "Responsável",
          nomePassageiro: passData.nome || "Passageiro",
          nomeMotorista: motorista.nome,
          apelidoMotorista: motorista.apelido,
          telefoneMotorista: motorista.telefone
        }
      );
    }
  }

  return await avancarProximoPassageiro(execucaoId);
};

const cancelarExecucao = async (execucaoId: string): Promise<any> => {
  if (!execucaoId) throw new AppError("ID da execução é obrigatório", 400);

  const { error } = await supabaseAdmin
    .from("execucoes_rota")
    .update({
      status: RouteExecutionStatus.CANCELADA,
      finalizada_em: new Date().toISOString()
    })
    .eq("id", execucaoId);

  if (error) throw error;
  return await getExecucaoDetail(execucaoId);
};

export const routeService = {
  createRoute,
  updateRoute,
  deleteRoute,
  getRoute,
  listRoutesByUsuario,
  listExecucoesByUsuario,
  getExecucaoDetail,
  iniciarRota,
  avancarProximoPassageiro,
  atualizarParadaStatus,
  cancelarExecucao
};
