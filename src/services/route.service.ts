import { AppError } from "../errors/AppError.js";
import { CreateRouteDTO, UpdateRouteDTO, StepRouteExecutionDTO, ReorderExecucaoDTO, CreateAusenciaDTO, ChamadaEscolaDTO, DELETE_AUSENCIA_BY_QUERY_PARAM } from "../types/dtos/route.dto.js";
import { RouteExecutionStatus, RouteStopStatus, RouteNodeType, RouteSentido, AtividadeAcao, AtividadeEntidadeTipo, UserType, RouteBroadcastEvent, NotificationChannelEnum, TipoResponsavel } from "../types/enums.js";
import { EVENTO_ROTA_A_CAMINHO_IDA, EVENTO_ROTA_EMBARCOU_IDA, EVENTO_ROTA_A_CAMINHO_VOLTA, EVENTO_ROTA_DESEMBARCOU_VOLTA, EVENTO_ROTA_REORDENADA } from "../config/constants.js";
import { routeRepository } from "../repositories/route.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { veiculoRepository } from "../repositories/veiculo.repository.js";
import { passageiroRepository } from "../repositories/passageiro.repository.js";
import { notificationService } from "./notifications/notification.service.js";
import { historicoService } from "./historico.service.js";
import { logger } from "../config/logger.js";
import { getNowBR, toPersistenceString } from "../utils/date.utils.js";

import { supabaseAdmin } from "../config/supabase.js";

const resolveDataOwnerId = async (usuarioId: string): Promise<{ dataOwnerId: string; veiculoId?: string; tipo?: UserType; contaPaiId?: string }> => {
  if (!usuarioId) return { dataOwnerId: usuarioId };
  try {
    const { data: userProfile } = await userRepository.getProfileData(usuarioId);
    let dataOwnerId = userProfile?.conta_pai_id || usuarioId;
    const veiculoId = userProfile?.veiculo_id || undefined;
    const tipo = userProfile?.tipo || undefined;
    const contaPaiId = userProfile?.conta_pai_id || undefined;

    if (!userProfile?.conta_pai_id && veiculoId) {
      const { data: veiculo } = await veiculoRepository.getUsuarioIdAndPlaca(veiculoId);
      if (veiculo?.usuario_id) {
        dataOwnerId = veiculo.usuario_id;
      }
    }

    return { dataOwnerId, veiculoId, tipo, contaPaiId };
  } catch (e) {
    return { dataOwnerId: usuarioId };
  }
};

const notifyFleetRealtime = async (event: string, payload: Record<string, unknown>) => {
  try {
    const channel = supabaseAdmin.channel("van360-fleet-sync");
    await channel.send({
      type: "broadcast",
      event: event,
      payload: payload
    });
    supabaseAdmin.removeChannel(channel);
  } catch (err) {
    logger.warn({ error: err }, "[RouteService] Falha ao emitir broadcast Realtime");
  }
};

const createRoute = async (data: CreateRouteDTO): Promise<any> => {
  if (!data.usuario_id) throw new AppError("Usuário obrigatório", 400);

  const { data: inserted, error } = await routeRepository.insert(
    data.usuario_id,
    data.nome,
    data.veiculo_id || null
  );

  if (error) throw error;

  const stops = data.paradas;

  if (stops && stops.length > 0) {
    const records = stops.map((p, idx) => ({
      rota_id: inserted.id,
      tipo_no: p.tipo_no || (p.escola_id ? RouteNodeType.ESCOLA : RouteNodeType.PASSAGEIRO),
      passageiro_id: p.passageiro_id || null,
      escola_id: p.escola_id || null,
      ordem: p.ordem !== undefined ? p.ordem : idx + 1,
      sentido: p.sentido || null
    }));

    try {
      const { error: assocError } = await routeRepository.insertPassageiros(records);
      if (assocError) throw assocError;
    } catch (assocError) {
      await routeRepository.delete(inserted.id);
      throw assocError;
    }
  }

  const createdRoute = await getRoute(inserted.id);

  notifyFleetRealtime("route_definition_changed", { action: "create", rotaId: inserted.id, veiculoId: inserted.veiculo_id });

  // --- LOG DE AUDITORIA ---
  historicoService.log({
    usuario_id: data.usuario_id,
    entidade_tipo: AtividadeEntidadeTipo.ROTA,
    entidade_id: inserted.id,
    acao: AtividadeAcao.ROTA_CRIADA,
    descricao: `Nova rota "${createdRoute?.nome || data.nome}" cadastrada.`,
    meta: { nome: createdRoute?.nome || data.nome, total_paradas: createdRoute?.paradas?.length || 0 }
  });

  return createdRoute;
};

const updateRoute = async (id: string, data: UpdateRouteDTO): Promise<any> => {
  if (!id) throw new AppError("ID da rota é obrigatório", 400);

  const oldRouteData = await routeRepository.getById(id).then(res => res.data);

  const updatePayload: any = {};
  if (data.nome !== undefined) updatePayload.nome = data.nome;
  if (data.veiculo_id !== undefined) updatePayload.veiculo_id = data.veiculo_id;

  if (Object.keys(updatePayload).length > 0) {
    const { error } = await routeRepository.update(id, updatePayload);
    if (error) throw error;
  }

  if (data.paradas !== undefined) {
    const { data: oldPassengers } = await routeRepository.getPassageirosByRotaId(id);

    await routeRepository.deletePassageiros(id);

    if (data.paradas && data.paradas.length > 0) {
      const records = data.paradas.map((p, idx) => ({
        rota_id: id,
        tipo_no: p.tipo_no || (p.escola_id ? RouteNodeType.ESCOLA : RouteNodeType.PASSAGEIRO),
        passageiro_id: p.passageiro_id || null,
        escola_id: p.escola_id || null,
        ordem: p.ordem !== undefined ? p.ordem : idx + 1,
        sentido: p.sentido || null
      }));

      try {
        const { error: insertError } = await routeRepository.insertPassageiros(records);
        if (insertError) {
          if (oldPassengers && oldPassengers.length > 0) {
            await routeRepository.insertPassageiros(oldPassengers);
          }
          throw insertError;
        }
      } catch (err) {
        throw err;
      }
    }
  }

  const updatedRoute = await getRoute(id);

  notifyFleetRealtime("route_definition_changed", {
    action: "update",
    rotaId: id,
    veiculoId: updatedRoute?.veiculo_id,
    previousVeiculoId: oldRouteData?.veiculo_id
  });

  return updatedRoute;
};

const deleteRoute = async (id: string): Promise<void> => {
  if (!id) throw new AppError("ID da rota é obrigatório", 400);

  const { data: activeExec } = await routeRepository.getExecucaoAtivaByRotaId(id);
  if (activeExec) {
    throw new AppError("Não é possível excluir esta rota pois ela possui uma execução ativa em andamento.", 400);
  }

  const oldRoute = await routeRepository.getById(id).then(res => res.data);

  const { error } = await routeRepository.delete(id);
  if (error) throw error;

  notifyFleetRealtime("route_definition_changed", { action: "delete", rotaId: id, veiculoId: oldRoute?.veiculo_id });

  // --- LOG DE AUDITORIA ---
  if (oldRoute?.usuario_id) {
    historicoService.log({
      usuario_id: oldRoute.usuario_id,
      entidade_tipo: AtividadeEntidadeTipo.ROTA,
      entidade_id: id,
      acao: AtividadeAcao.ROTA_EXCLUIDA,
      descricao: `Rota "${oldRoute.nome || 'Rota'}" excluída do sistema.`,
      meta: { backup: oldRoute }
    });
  }
};

const getTodayLocalDateStr = (): string => {
  return toPersistenceString(getNowBR());
};

const _enrichPassageiroNaParada = (pass: any) => {
  if (!pass) return pass;
  const rawLinks = pass.responsaveis;
  if (rawLinks && Array.isArray(rawLinks)) {
    const links = [...rawLinks].sort((a: any, b: any) => {
      if (a.tipo === TipoResponsavel.PRINCIPAL) return -1;
      if (b.tipo === TipoResponsavel.PRINCIPAL) return 1;
      return 0;
    });

    const principalLink = links.find((l: any) => l.tipo === TipoResponsavel.PRINCIPAL) || links[0];
    const resp = principalLink?.responsavel;
    const respObj = Array.isArray(resp) ? resp[0] : resp;

    if (respObj) {
      pass.responsavel_principal = {
        id: respObj.id,
        nome: respObj.nome,
        telefone: respObj.telefone,
        cpf: respObj.cpf,
        email: respObj.email,
        parentesco: principalLink?.parentesco || null,
        logradouro: respObj.logradouro || null,
        numero: respObj.numero || null,
        bairro: respObj.bairro || null,
        cidade: respObj.cidade || null,
        estado: respObj.estado || null,
        cep: respObj.cep || null,
        referencia: respObj.referencia || null,
        complemento: respObj.complemento || null,
      };
    }

    pass.responsaveis = links
      .map((l: any) => {
        const rObj = Array.isArray(l.responsavel) ? l.responsavel[0] : l.responsavel;
        if (!rObj) return null;
        return {
          id: rObj.id || l.id,
          responsavel_id: rObj.id,
          tipo: l.tipo,
          parentesco: l.parentesco,
          nome: rObj.nome,
          telefone: rObj.telefone,
          cpf: rObj.cpf,
          email: rObj.email,
          logradouro: rObj.logradouro || null,
          numero: rObj.numero || null,
          bairro: rObj.bairro || null,
          cidade: rObj.cidade || null,
          estado: rObj.estado || null,
          cep: rObj.cep || null,
          referencia: rObj.referencia || null,
          complemento: rObj.complemento || null,
        };
      })
      .filter(Boolean);
  }
  return pass;
};

const getRoute = async (id: string, dataAusencia?: string, targetOwnerId?: string, assignedVeiculoId?: string): Promise<any> => {
  const { data: route, error } = await routeRepository.getById(id);

  if (error) throw error;
  if (!route) {
    throw new AppError("Rota não encontrada", 404);
  }

  if (targetOwnerId && route.usuario_id !== targetOwnerId) {
    throw new AppError("Acesso negado", 403);
  }

  if (assignedVeiculoId && route.veiculo_id && route.veiculo_id !== assignedVeiculoId) {
    throw new AppError("Acesso negado para este veículo", 403);
  }

  const targetDate = dataAusencia || getTodayLocalDateStr();
  const { data: ausencias } = await routeRepository.getAusenciasByRotaEData(id, targetDate);
  const ausentesMap = new Map((ausencias || []).map((a: any) => [a.passageiro_id, a]));

  if (route.rota_passageiros) {
    const paradasList = route.rota_passageiros
      .map((rp: any) => {
        const isAusente = rp.passageiro_id && ausentesMap.has(rp.passageiro_id);
        const ausObj = isAusente ? ausentesMap.get(rp.passageiro_id) : null;
        const pass = _enrichPassageiroNaParada(rp.passageiro);

        return {
          id: rp.id,
          tipo_no: rp.tipo_no || (rp.escola_id ? RouteNodeType.ESCOLA : RouteNodeType.PASSAGEIRO),
          ordem: rp.ordem,
          passageiro_id: rp.passageiro_id,
          escola_id: rp.escola_id,
          sentido: rp.sentido || null,
          passageiro: pass,
          escola: rp.escola,
          status: isAusente ? RouteStopStatus.AUSENTE : RouteStopStatus.PENDENTE,
          is_ausente: isAusente,
          ausencia_id: ausObj?.id
        };
      })
      .sort((a: any, b: any) => a.ordem - b.ordem);

    route.paradas = paradasList;
    delete route.rota_passageiros;
  } else {
    route.paradas = [];
  }

  route.ausencias = ausencias || [];
  return route;
};

const listRoutesByUsuario = async (usuarioId: string, veiculoId?: string): Promise<any[]> => {
  if (!usuarioId) throw new AppError("ID do usuário é obrigatório", 400);

  const { dataOwnerId, veiculoId: userVeiculoId, contaPaiId } = await resolveDataOwnerId(usuarioId);
  const isGestor = !contaPaiId;
  const targetVeiculoId = veiculoId || (isGestor ? undefined : userVeiculoId);

  try {
    const { data: routes, error } = await routeRepository.listByUsuario(dataOwnerId, targetVeiculoId);

    if (error) {
      const { data: fallbackRoutes, error: fbError } = await routeRepository.listByUsuarioFallback(dataOwnerId, targetVeiculoId);

      if (fbError) throw new AppError(`Erro ao buscar rotas: ${fbError.message}`, 500);
      return (fallbackRoutes || []).map(r => ({ ...r, numero_passageiros: 0 }));
    }

    return (routes || []).map((route: any) => {
      const count = route.rota_passageiros ? route.rota_passageiros.length : 0;
      delete route.rota_passageiros;
      return {
        ...route,
        numero_passageiros: count
      };
    });
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    logger.error({ error: err?.message || String(err), usuarioId }, "[RouteService] Erro ao listar rotas do usuário");
    throw new AppError("Erro ao buscar rotas do usuário", 500);
  }
};

const listExecucoesByUsuario = async (usuarioId: string, veiculoId?: string, limit?: number, page: number = 1): Promise<any[]> => {
  if (!usuarioId) throw new AppError("ID do usuário é obrigatório", 400);

  const { dataOwnerId, veiculoId: userVeiculoId, contaPaiId } = await resolveDataOwnerId(usuarioId);
  const isGestor = !contaPaiId;
  const targetVeiculoId = veiculoId || (isGestor ? undefined : userVeiculoId);

  try {
    const { data: execs, error } = await routeRepository.listExecucoesByUsuario(dataOwnerId, targetVeiculoId, limit, page);

    if (error) {
      const { data: fallbackExecs, error: fbError } = await routeRepository.listExecucoesByUsuarioFallback(dataOwnerId, limit, page);
      if (fbError) throw new AppError(`Erro ao buscar execuções: ${fbError.message}`, 500);
      return fallbackExecs || [];
    }
    return execs || [];
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    logger.error({ error: err?.message || String(err), usuarioId }, "[RouteService] Erro ao listar execuções do usuário");
    throw new AppError("Erro ao buscar execuções de rotas", 500);
  }
};

const getExecucaoDetail = async (id: string, targetOwnerId?: string, assignedVeiculoId?: string): Promise<any> => {
  let { data: exec, error } = await routeRepository.getExecucaoDetail(id);

  if (!exec && !error) {
    const { data: activeByRota } = await routeRepository.getExecucaoAtivaByRotaId(id);
    if (activeByRota) {
      const { data: fullExec } = await routeRepository.getExecucaoDetail(activeByRota.id);
      exec = fullExec;
    }
  }

  if (error) throw error;
  if (!exec) {
    throw new AppError("Execução de rota não encontrada", 404);
  }

  if (targetOwnerId && exec.rota?.usuario_id && exec.rota.usuario_id !== targetOwnerId) {
    throw new AppError("Acesso negado", 403);
  }

  if (assignedVeiculoId && exec.rota?.veiculo_id && exec.rota.veiculo_id !== assignedVeiculoId) {
    throw new AppError("Acesso negado para este veículo", 403);
  }

  if (exec.execucoes_rota_passageiros) {
    exec.paradas = exec.execucoes_rota_passageiros
      .map((erp: any) => ({
        id: erp.id,
        tipo_no: erp.tipo_no || (erp.escola_id ? RouteNodeType.ESCOLA : RouteNodeType.PASSAGEIRO),
        status: erp.status,
        ordem: erp.ordem,
        notificado_em: erp.notificado_em,
        visitado_em: erp.visitado_em,
        passageiro_id: erp.passageiro_id,
        escola_id: erp.escola_id,
        sentido: erp.sentido,
        passageiro: _enrichPassageiroNaParada(erp.passageiro),
        escola: erp.escola
      }))
      .sort((a: any, b: any) => a.ordem - b.ordem);

    delete exec.execucoes_rota_passageiros;
  } else {
    exec.paradas = [];
  }

  return exec;
};

const iniciarRota = async (rotaId: string, usuarioId: string, notificarPais: boolean = true): Promise<any> => {
  if (!rotaId) throw new AppError("ID da rota é obrigatório", 400);
  if (!usuarioId) throw new AppError("ID do usuário é obrigatório", 400);

  // Verifica se esta rota específica já possui uma execução ativa em andamento
  const { data: activeExec, error: checkError } = await routeRepository.getExecucaoAtivaByRotaId(rotaId);

  if (checkError) throw checkError;
  if (activeExec) {
    // Se esta rota já tiver uma execução em andamento, retorna os detalhes da execução existente
    return getExecucaoDetail(activeExec.id);
  }

  const route = await getRoute(rotaId);
  if (!route) throw new AppError("Rota não encontrada", 404);

  // Se a rota possui um veículo associado, verifica se esse veículo JÁ TEM outra corrida em andamento!
  if (route.veiculo_id) {
    const { data: vehicleActiveExec } = await routeRepository.getExecucaoAtivaByVeiculoId(route.veiculo_id);
    if (vehicleActiveExec && vehicleActiveExec.rota_id !== rotaId) {
      const nomeRotaEmAndamento = (vehicleActiveExec.rota as any)?.nome || "outra rota";
      throw new AppError(`Este veículo já possui uma rota em andamento ("${nomeRotaEmAndamento}"). Encerre a corrida atual para iniciar outra.`, 400);
    }
  }

  if (!route.paradas || route.paradas.length === 0) {
    throw new AppError("A rota selecionada não possui paradas cadastradas.", 400);
  }

  let inativosContador = 0;
  const paradasValidas = route.paradas.filter((p: any) => {
    if (p.tipo_no === RouteNodeType.PASSAGEIRO && p.passageiro) {
      if (p.passageiro.ativo === false) {
        inativosContador++;
        return false;
      }
    }
    return true;
  });

  if (paradasValidas.length === 0) {
    throw new AppError("Não há passageiros ativos cadastrados nesta rota.", 400);
  }

  const { data: exec, error: execError } = await routeRepository.insertExecucao(rotaId, usuarioId, notificarPais);

  if (execError) throw execError;

  const todayStr = getTodayLocalDateStr();
  const { data: ausenciasHoje } = await routeRepository.getAusenciasByRotaEData(rotaId, todayStr);
  const ausentesSet = new Set((ausenciasHoje || []).map((a: any) => a.passageiro_id));

  const paradasRecords = paradasValidas.map((p: any, idx: number) => {
    const isAusentePrevia = p.tipo_no === RouteNodeType.PASSAGEIRO && p.passageiro_id && ausentesSet.has(p.passageiro_id);

    return {
      execucao_rota_id: exec.id,
      tipo_no: p.tipo_no,
      passageiro_id: p.passageiro_id || null,
      escola_id: p.escola_id || null,
      ordem: idx + 1,
      status: isAusentePrevia ? RouteStopStatus.AUSENTE : RouteStopStatus.PENDENTE,
      visitado_em: isAusentePrevia ? new Date().toISOString() : null,
      sentido: p.sentido || null
    };
  });

  const { error: paradasError } = await routeRepository.insertExecucaoParadas(paradasRecords);

  if (paradasError) throw paradasError;

  if (notificarPais) {
    await notifyNextPendingPassengerStop(exec.id);
  }

  await checkEFinalizarSeTodasParadasConcluidas(exec.id);

  const result = await getExecucaoDetail(exec.id);

  // --- LOG DE AUDITORIA ---
  if (usuarioId) {
    historicoService.log({
      usuario_id: usuarioId,
      entidade_tipo: AtividadeEntidadeTipo.ROTA,
      entidade_id: rotaId,
      acao: AtividadeAcao.ROTA_INICIADA,
      descricao: `Execução da rota "${route.nome || 'Rota'}" foi iniciada.`,
      meta: { execucao_id: exec.id, total_paradas: paradasValidas.length }
    });
  }

  notifyFleetRealtime(RouteBroadcastEvent.ROUTE_EXECUTION_CHANGED, {
    action: "iniciar",
    execucaoId: exec.id,
    rotaId: rotaId,
    veiculoId: route?.veiculo_id,
    status: RouteExecutionStatus.INICIADA
  });

  return {
    ...result,
    alertaInativos: inativosContador > 0 ? `${inativosContador} passageiro(s) inativo(s) foram desconsiderados nesta corrida.` : null
  };
};

const atualizarParadaStatus = async (
  execucaoId: string,
  paradaId: string,
  novoStatus: RouteStopStatus
): Promise<any> => {
  if (!execucaoId) throw new AppError("ID da execução é obrigatório", 400);
  if (!paradaId) throw new AppError("ID da parada é obrigatório", 400);

  const [
    { data: exec, error: execError },
    { data: paradaObj },
    { data: paradaAtualObj }
  ] = await Promise.all([
    routeRepository.getExecucaoResumida(execucaoId),
    routeRepository.getParadaById(paradaId),
    routeRepository.getParadaAtualPendente(execucaoId)
  ]);

  if (execError) throw execError;
  if (!exec || exec.status !== RouteExecutionStatus.INICIADA) {
    throw new AppError("Esta rota não está ativa.", 400);
  }

  const isEmbarqueEscola = paradaObj?.tipo_no === RouteNodeType.PASSAGEIRO &&
    paradaAtualObj && paradaAtualObj.length > 0 &&
    paradaAtualObj[0].tipo_no === RouteNodeType.ESCOLA &&
    novoStatus === RouteStopStatus.EMBARCADO;

  if (novoStatus === RouteStopStatus.AUSENTE && paradaObj?.passageiro_id) {
    await routeRepository.updateTodasParadasDoPassageiroStatus(
      paradaObj.passageiro_id,
      execucaoId,
      RouteStopStatus.AUSENTE,
      new Date().toISOString()
    );

    if (exec.rota_id) {
      const todayStr = getTodayLocalDateStr();
      const { data: ausenciasExistentes } = await routeRepository.getAusenciasByRotaEData(exec.rota_id, todayStr);
      const jaExiste = ausenciasExistentes?.some((a: any) => a.passageiro_id === paradaObj.passageiro_id);
      if (!jaExiste) {
        const { error: insError } = await routeRepository.insertAusencia({
          passageiro_id: paradaObj.passageiro_id,
          rota_id: exec.rota_id,
          data_ausencia: todayStr,
          registrado_por: exec.usuario_id || null,
        });
        if (insError) {
          logger.error({ insError }, "Erro ao inserir em rota_ausencias durante a execução");
        }
      }
    }
  } else if (novoStatus === RouteStopStatus.PENDENTE && paradaObj?.passageiro_id) {
    await routeRepository.updateTodasParadasDoPassageiroStatus(
      paradaObj.passageiro_id,
      execucaoId,
      RouteStopStatus.PENDENTE,
      null
    );
    if (exec.rota_id) {
      const todayStr = getTodayLocalDateStr();
      await routeRepository.deleteAusenciaByPassageiroERota(paradaObj.passageiro_id, exec.rota_id, todayStr);
    }
  } else {
    const { error: updateError } = await routeRepository.updateParadaStatus(
      paradaId,
      execucaoId,
      novoStatus,
      novoStatus === RouteStopStatus.PENDENTE ? null : (isEmbarqueEscola ? null : new Date().toISOString())
    );
    if (updateError) throw updateError;
  }

  notifyFleetRealtime("stop_status_changed", { execucaoId, paradaId, status: novoStatus });

  const shouldNotify = (exec as any)?.notificar_pais !== false;

  if (shouldNotify && paradaObj?.passageiro_id) {
    let routeEvent: string | null = null;
    const sentido = (paradaObj as any)?.sentido;

    if (novoStatus === RouteStopStatus.EMBARCADO) {
      routeEvent = sentido === RouteSentido.VOLTANDO ? EVENTO_ROTA_A_CAMINHO_VOLTA : EVENTO_ROTA_EMBARCOU_IDA;
    } else if (novoStatus === RouteStopStatus.DESEMBARCADO) {
      routeEvent = sentido === RouteSentido.VOLTANDO ? EVENTO_ROTA_DESEMBARCOU_VOLTA : EVENTO_ROTA_A_CAMINHO_IDA;
    }

    if (routeEvent && !paradaObj.notificacao_concluido_enviada) {
      await notifyParentRouteEvent(paradaObj.passageiro_id, routeEvent, exec);
      await routeRepository.updateNotificacaoConcluidoEnviada(paradaId, true);
    }
  }

  if (shouldNotify) {
    await notifyNextPendingPassengerStop(execucaoId);
  }

  await checkEFinalizarSeTodasParadasConcluidas(execucaoId);

  return await getExecucaoDetail(execucaoId);
};

const notifyNextPendingPassengerStop = async (execucaoId: string) => {
  try {
    const { data: exec } = await routeRepository.getExecucaoResumida(execucaoId);
    if (!exec || (exec as any).notificar_pais === false) return;

    const execDetail = await getExecucaoDetail(execucaoId);
    if (!execDetail || !Array.isArray(execDetail.paradas)) return;

    const sortedStops = [...execDetail.paradas].sort((a: any, b: any) => a.ordem - b.ordem);
    const nextStop = sortedStops.find(
      (p: any) => p.status === RouteStopStatus.PENDENTE && p.tipo_no === RouteNodeType.PASSAGEIRO && p.passageiro_id
    );

    if (nextStop && !nextStop.notificacao_a_caminho_enviada) {
      const eventType = nextStop.sentido === RouteSentido.VOLTANDO
        ? EVENTO_ROTA_A_CAMINHO_VOLTA
        : EVENTO_ROTA_A_CAMINHO_IDA;

      await notifyParentRouteEvent(nextStop.passageiro_id, eventType, exec);
      await routeRepository.updateNotificacaoACaminhoEnviada(nextStop.id, true);
    }
  } catch (err) {
    logger.error({ err, execucaoId }, "[routeService] Erro ao notificar próxima parada pendente");
  }
};

const notifyParentRouteEvent = async (passageiroId: string, eventType: string, execData: any) => {
  try {
    const passageiroInfo = await passageiroRepository.getResponsavelInfo(passageiroId);
    if (!passageiroInfo) return;
    const resp = passageiroInfo.responsavel_principal;
    if (resp?.telefone) {
      await notificationService.notifyPassenger(
        resp.telefone,
        eventType,
        {
          nomePassageiro: passageiroInfo.nome,
          passageiroId: passageiroInfo.id,
          rotaId: execData.rota_id,
        },
        { channels: [NotificationChannelEnum.FIREBASE], usuarioId: execData.usuario_id }
      ).catch(err => logger.error({ err }, "[routeService] Erro ao enviar Push de rota ao responsável"));
    }
  } catch (err) {
    logger.error({ err }, "[routeService] Falha ao notificar responsável sobre status da rota");
  }
};

const processarChamadaEscola = async (execucaoId: string, data: ChamadaEscolaDTO): Promise<any> => {
  if (!execucaoId) throw new AppError("ID da execução é obrigatório", 400);

  const { data: exec, error: execError } = await routeRepository.getExecucaoResumida(execucaoId);
  if (execError) throw execError;
  if (!exec || exec.status !== RouteExecutionStatus.INICIADA) {
    throw new AppError("Esta rota não está ativa.", 400);
  }

  const todayStr = getTodayLocalDateStr();

  // Processar apenas alunos indicados como AUSENTE na chamada
  const ausentes = data.chamada.filter((item) => item.status === RouteStopStatus.AUSENTE);

  for (const item of ausentes) {
    const { data: paradaObj } = await routeRepository.getParadaById(item.parada_id);
    if (!paradaObj || !paradaObj.passageiro_id) continue;

    // Atualizar todas as paradas do passageiro nesta execução para AUSENTE
    await routeRepository.updateTodasParadasDoPassageiroStatus(
      paradaObj.passageiro_id,
      execucaoId,
      RouteStopStatus.AUSENTE,
      new Date().toISOString()
    );

    // Registrar ausência na tabela rota_ausencias para o dia de hoje
    if (exec.rota_id) {
      const { data: ausenciasExistentes } = await routeRepository.getAusenciasByRotaEData(exec.rota_id, todayStr);
      const jaExiste = ausenciasExistentes?.some((a: any) => a.passageiro_id === paradaObj.passageiro_id);
      if (!jaExiste) {
        const { error: insError } = await routeRepository.insertAusencia({
          passageiro_id: paradaObj.passageiro_id,
          rota_id: exec.rota_id,
          data_ausencia: todayStr,
          registrado_por: exec.usuario_id || null,
        });
        if (insError) {
          logger.error({ insError }, "Erro ao inserir em rota_ausencias durante chamada escola");
        }
      }
    }
  }

  // Notificar frotas via WebSocket/Realtime sem concluir o nó da escola e sem finalizar a rota
  notifyFleetRealtime("stop_status_changed", { execucaoId });

  if ((exec as any)?.notificar_pais !== false) {
    await notifyNextPendingPassengerStop(execucaoId);
  }

  return await getExecucaoDetail(execucaoId);
};

const reordenarExecucao = async (execucaoId: string, data: ReorderExecucaoDTO): Promise<any> => {
  if (!execucaoId) throw new AppError("ID da execução é obrigatório", 400);

  if (data.paradas && data.paradas.length > 0) {
    await routeRepository.updateParadasOrdemBatch(execucaoId, data.paradas);
  }

  const { data: exec } = await routeRepository.getExecucaoResumida(execucaoId);
  if (exec && (exec as any).notificar_pais !== false) {
    const execDetail = await getExecucaoDetail(execucaoId);
    if (execDetail && Array.isArray(execDetail.paradas)) {
      const sortedStops = [...execDetail.paradas].sort((a: any, b: any) => a.ordem - b.ordem);
      const pendingPassengerStops = sortedStops.filter(
        (p: any) => p.status === RouteStopStatus.PENDENTE && p.tipo_no === RouteNodeType.PASSAGEIRO && p.passageiro_id
      );

      if (pendingPassengerStops.length > 0) {
        const newFirstPending = pendingPassengerStops[0];
        if (!newFirstPending.notificacao_a_caminho_enviada) {
          const eventType = newFirstPending.sentido === RouteSentido.VOLTANDO
            ? EVENTO_ROTA_A_CAMINHO_VOLTA
            : EVENTO_ROTA_A_CAMINHO_IDA;
          await notifyParentRouteEvent(newFirstPending.passageiro_id, eventType, exec);
          await routeRepository.updateNotificacaoACaminhoEnviada(newFirstPending.id, true);
        }

        for (let i = 1; i < pendingPassengerStops.length; i++) {
          const p = pendingPassengerStops[i];
          if (p.notificacao_a_caminho_enviada) {
            await notifyParentRouteEvent(p.passageiro_id, EVENTO_ROTA_REORDENADA, exec);
            await routeRepository.updateNotificacaoACaminhoEnviada(p.id, false);
          }
        }
      }
    }
  }

  return await getExecucaoDetail(execucaoId);
};

const cancelarExecucao = async (execucaoId: string): Promise<any> => {
  if (!execucaoId) throw new AppError("ID da execução é obrigatório", 400);

  const { error } = await routeRepository.updateExecucaoStatus(
    execucaoId,
    RouteExecutionStatus.CANCELADA,
    new Date().toISOString()
  );

  if (error) throw error;

  const execDetail = await getExecucaoDetail(execucaoId);

  // --- LOG DE AUDITORIA ---
  if (execDetail?.usuario_id) {
    historicoService.log({
      usuario_id: execDetail.usuario_id,
      entidade_tipo: AtividadeEntidadeTipo.ROTA,
      entidade_id: execDetail.rota_id || execucaoId,
      acao: AtividadeAcao.ROTA_CANCELADA,
      descricao: `Execução da rota "${execDetail.rota?.nome || 'Rota'}" foi cancelada.`,
      meta: { execucao_id: execucaoId }
    });
  }

  notifyFleetRealtime("route_execution_changed", {
    action: "cancelar",
    execucaoId: execucaoId,
    status: RouteExecutionStatus.CANCELADA
  });

  return execDetail;
};

const finalizarExecucao = async (execucaoId: string): Promise<any> => {
  if (!execucaoId) throw new AppError("ID da execução é obrigatório", 400);

  const currentExec = await getExecucaoDetail(execucaoId);
  if (currentExec?.status === RouteExecutionStatus.CONCLUIDA) {
    return currentExec;
  }

  const { error } = await routeRepository.updateExecucaoStatus(
    execucaoId,
    RouteExecutionStatus.CONCLUIDA,
    new Date().toISOString()
  );

  if (error) throw error;

  notifyFleetRealtime("route_execution_changed", {
    action: "finalizar",
    execucaoId: execucaoId,
    status: RouteExecutionStatus.CONCLUIDA
  });

  const execDetail = await getExecucaoDetail(execucaoId);

  // --- LOG DE AUDITORIA ---
  if (execDetail?.usuario_id) {
    historicoService.log({
      usuario_id: execDetail.usuario_id,
      entidade_tipo: AtividadeEntidadeTipo.ROTA,
      entidade_id: execDetail.rota_id || execucaoId,
      acao: AtividadeAcao.ROTA_CONCLUIDA,
      descricao: `Execução da rota "${execDetail.rota?.nome || 'Rota'}" foi concluída com sucesso.`,
      meta: { execucao_id: execucaoId, total_paradas: execDetail.paradas?.length || 0 }
    });
  }

  return execDetail;
};

const checkEFinalizarSeTodasParadasConcluidas = async (execucaoId: string): Promise<boolean> => {
  const { data: pendentes } = await routeRepository.getPendentes(execucaoId);
  if (!pendentes || pendentes.length === 0) {
    await finalizarExecucao(execucaoId);
    return true;
  }
  return false;
};

const registrarAusenciaAntecipada = async (data: CreateAusenciaDTO & { registrado_por?: string }): Promise<any> => {
  if (!data.passageiro_id) throw new AppError("Passageiro é obrigatório", 400);
  if (!data.rota_id) throw new AppError("Rota é obrigatória", 400);
  if (!data.data_ausencia) throw new AppError("Data da ausência é obrigatória", 400);

  // Prevenção de duplicidade: se já existir ausência cadastrada para esta rota, passageiro e data, reaproveita
  const { data: ausenciasExistentes } = await routeRepository.getAusenciasByRotaEData(data.rota_id, data.data_ausencia);
  const existente = ausenciasExistentes?.find((a: any) => a.passageiro_id === data.passageiro_id);
  if (existente) {
    return existente;
  }

  const { data: inserted, error } = await routeRepository.insertAusencia({
    passageiro_id: data.passageiro_id,
    rota_id: data.rota_id,
    data_ausencia: data.data_ausencia,
    sentido: data.sentido || null,
    registrado_por: data.registrado_por || null
  });

  if (error) throw error;

  // --- LOG DE AUDITORIA ---
  if (data.registrado_por) {
    historicoService.log({
      usuario_id: data.registrado_por,
      entidade_tipo: AtividadeEntidadeTipo.ROTA,
      entidade_id: data.rota_id,
      acao: AtividadeAcao.PASSAGEIRO_STATUS,
      descricao: `Registrou ausência antecipada para o passageiro "${inserted?.passageiro?.nome || 'Passageiro'}" na data ${data.data_ausencia}.`,
      meta: { passageiro_id: data.passageiro_id, rota_id: data.rota_id, data_ausencia: data.data_ausencia }
    });
  }

  // Se a rota já estiver em EXECUÇÃO ATIVA, sincroniza o status da parada em execucoes_rota_passageiros
  const { data: execAtiva } = await routeRepository.getExecucaoAtivaByRotaId(data.rota_id);
  if (execAtiva?.id) {
    await routeRepository.updateTodasParadasDoPassageiroStatus(
      data.passageiro_id,
      execAtiva.id,
      RouteStopStatus.AUSENTE,
      new Date().toISOString()
    );
    notifyFleetRealtime("stop_status_changed", {
      execucaoId: execAtiva.id,
      passageiroId: data.passageiro_id,
      status: RouteStopStatus.AUSENTE
    });

    // Se a marcação de ausência completou todas as paradas da corrida ativa, finaliza automaticamente a rota
    await checkEFinalizarSeTodasParadasConcluidas(execAtiva.id);
  }

  notifyFleetRealtime("absence_changed", { rotaId: data.rota_id, passageiroId: data.passageiro_id });

  return inserted;
};

const removerAusenciaAntecipada = async (id: string, passageiroId?: string, rotaId?: string, dataAusencia?: string): Promise<void> => {
  let targetPid = passageiroId;
  let targetRotaId = rotaId;
  let targetDate = dataAusencia;

  if (id && id !== DELETE_AUSENCIA_BY_QUERY_PARAM) {
    const { data: aus } = await routeRepository.getAusenciaById(id);
    if (aus) {
      targetPid = aus.passageiro_id;
      targetRotaId = aus.rota_id;
      targetDate = aus.data_ausencia;
    }
  }

  if (targetPid && targetRotaId) {
    const dateStr = targetDate || getTodayLocalDateStr();
    const { error } = await routeRepository.deleteAusenciaByPassageiroERota(targetPid, targetRotaId, dateStr);
    if (error) throw error;
  } else if (id && id !== DELETE_AUSENCIA_BY_QUERY_PARAM) {
    const { error } = await routeRepository.deleteAusencia(id);
    if (error) throw error;
  }

  // Se a rota já estiver em EXECUÇÃO ATIVA, restaura o status da parada para PENDENTE em execucoes_rota_passageiros
  if (targetRotaId && targetPid) {
    const { data: execAtiva } = await routeRepository.getExecucaoAtivaByRotaId(targetRotaId);
    if (execAtiva?.id) {
      await routeRepository.updateTodasParadasDoPassageiroStatus(
        targetPid,
        execAtiva.id,
        RouteStopStatus.PENDENTE,
        null
      );
      notifyFleetRealtime("stop_status_changed", {
        execucaoId: execAtiva.id,
        passageiroId: targetPid,
        status: RouteStopStatus.PENDENTE
      });
    }
  }

  notifyFleetRealtime("absence_changed", { rotaId: targetRotaId, passageiroId: targetPid });
};

const listAusenciasByRota = async (rotaId: string, dataAusencia?: string): Promise<any[]> => {
  if (!rotaId) throw new AppError("ID da rota é obrigatório", 400);
  const targetDate = dataAusencia || toPersistenceString(getNowBR());

  const { data: ausencias, error } = await routeRepository.getAusenciasByRotaEData(rotaId, targetDate);
  if (error) throw error;

  return ausencias || [];
};

const listAusenciasByPassageiro = async (passageiroId: string): Promise<any[]> => {
  if (!passageiroId) throw new AppError("ID do passageiro é obrigatório", 400);

  const { data: ausencias, error } = await routeRepository.getAusenciasByPassageiro(passageiroId);
  if (error) throw error;

  return ausencias || [];
};

const listRotasByPassageiro = async (passageiroId: string): Promise<any[]> => {
  if (!passageiroId) throw new AppError("ID do passageiro é obrigatório", 400);

  const { data, error } = await routeRepository.getRotasByPassageiro(passageiroId);
  if (error) throw error;

  return (data || []).map((item: any) => item.rota).filter(Boolean);
};

const getExecucaoAtivaByVeiculoId = async (veiculoId: string): Promise<any> => {
  if (!veiculoId) return null;
  const { data, error } = await routeRepository.getExecucaoAtivaByVeiculoId(veiculoId);
  if (error) return null;
  return data || null;
};

export const routeService = {
  createRoute,
  updateRoute,
  deleteRoute,
  getRoute,
  listRoutesByUsuario,
  listExecucoesByUsuario,
  getExecucaoAtivaByVeiculoId,
  getExecucaoDetail,
  iniciarRota,
  atualizarParadaStatus,
  processarChamadaEscola,
  reordenarExecucao,
  cancelarExecucao,
  finalizarExecucao,
  registrarAusenciaAntecipada,
  removerAusenciaAntecipada,
  listAusenciasByRota,
  listAusenciasByPassageiro,
  listRotasByPassageiro
};
