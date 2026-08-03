import { AppError } from "../errors/AppError.js";
import { CreateRouteDTO, UpdateRouteDTO, StepRouteExecutionDTO, ReorderExecucaoDTO, CreateAusenciaDTO, DELETE_AUSENCIA_BY_QUERY_PARAM } from "../types/dtos/route.dto.js";
import { RouteExecutionStatus, RouteStopStatus, RouteNodeType, RouteSentido, AtividadeAcao, AtividadeEntidadeTipo } from "../types/enums.js";
import { routeRepository } from "../repositories/route.repository.js";
import { historicoService } from "./historico.service.js";

const createRoute = async (data: CreateRouteDTO): Promise<any> => {
  if (!data.usuario_id) throw new AppError("Usuário obrigatório", 400);
  if (!data.nome) throw new AppError("Nome da rota é obrigatório", 400);

  const { data: inserted, error } = await routeRepository.insert(
    data.usuario_id,
    data.nome,
    data.veiculo_id || null
  );

  if (error) throw error;

  if (data.passageiros && data.passageiros.length > 0) {
    const records = data.passageiros.map((p, idx) => ({
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

  // --- LOG DE AUDITORIA ---
  historicoService.log({
    usuario_id: data.usuario_id,
    entidade_tipo: AtividadeEntidadeTipo.ROTA,
    entidade_id: inserted.id,
    acao: AtividadeAcao.ROTA_CRIADA,
    descricao: `Nova rota "${createdRoute?.nome || data.nome}" cadastrada.`,
    meta: { nome: createdRoute?.nome || data.nome, total_paradas: createdRoute?.passageiros?.length || 0 }
  });

  return createdRoute;
};

const updateRoute = async (id: string, data: UpdateRouteDTO): Promise<any> => {
  if (!id) throw new AppError("ID da rota é obrigatório", 400);

  const updatePayload: any = {};
  if (data.nome !== undefined) updatePayload.nome = data.nome;
  if (data.veiculo_id !== undefined) updatePayload.veiculo_id = data.veiculo_id;

  if (Object.keys(updatePayload).length > 0) {
    const { error } = await routeRepository.update(id, updatePayload);
    if (error) throw error;
  }

  if (data.passageiros !== undefined) {
    const { data: oldPassengers } = await routeRepository.getPassageirosByRotaId(id);

    await routeRepository.deletePassageiros(id);

    if (data.passageiros && data.passageiros.length > 0) {
      const records = data.passageiros.map((p, idx) => ({
        rota_id: id,
        tipo_no: p.tipo_no || (p.escola_id ? RouteNodeType.ESCOLA : RouteNodeType.PASSAGEIRO),
        passageiro_id: p.passageiro_id || null,
        escola_id: p.escola_id || null,
        ordem: p.ordem !== undefined ? p.ordem : idx + 1,
        sentido: p.sentido || null
      }));

      try {
        const { error: insertError } = await routeRepository.insertPassageiros(records);
        if (insertError) throw insertError;
      } catch (insertError) {
        if (oldPassengers && oldPassengers.length > 0) {
          await routeRepository.insertPassageiros(oldPassengers);
        }
        throw insertError;
      }
    }
  }

  const updatedRoute = await getRoute(id);

  // --- LOG DE AUDITORIA ---
  if (updatedRoute?.usuario_id) {
    historicoService.log({
      usuario_id: updatedRoute.usuario_id,
      entidade_tipo: AtividadeEntidadeTipo.ROTA,
      entidade_id: id,
      acao: AtividadeAcao.ROTA_EDITADA,
      descricao: `Configuração da rota "${updatedRoute.nome}" atualizada.`,
      meta: { nome: updatedRoute.nome, total_paradas: updatedRoute.passageiros?.length || 0 }
    });
  }

  return updatedRoute;
};

const deleteRoute = async (id: string): Promise<void> => {
  if (!id) throw new AppError("ID da rota é obrigatório", 400);

  const oldRoute = await routeRepository.getById(id).then(res => res.data);

  const { error } = await routeRepository.delete(id);
  if (error) throw error;

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
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getRoute = async (id: string, dataAusencia?: string): Promise<any> => {
  const { data: route, error } = await routeRepository.getById(id);

  if (error) throw error;
  if (!route) {
    throw new AppError("Rota não encontrada", 404);
  }

  const targetDate = dataAusencia || getTodayLocalDateStr();
  const { data: ausencias } = await routeRepository.getAusenciasByRotaEData(id, targetDate);
  const ausentesMap = new Map((ausencias || []).map((a: any) => [a.passageiro_id, a]));

  if (route.rota_passageiros) {
    route.passageiros = route.rota_passageiros
      .map((rp: any) => {
        const isAusente = rp.passageiro_id && ausentesMap.has(rp.passageiro_id);
        const ausObj = isAusente ? ausentesMap.get(rp.passageiro_id) : null;

        return {
          id: rp.id,
          tipo_no: rp.tipo_no || (rp.escola_id ? RouteNodeType.ESCOLA : RouteNodeType.PASSAGEIRO),
          ordem: rp.ordem,
          passageiro_id: rp.passageiro_id,
          escola_id: rp.escola_id,
          sentido: rp.sentido || null,
          passageiro: rp.passageiro,
          escola: rp.escola,
          status: isAusente ? RouteStopStatus.AUSENTE : RouteStopStatus.PENDENTE,
          is_ausente: isAusente,
          ausencia_id: ausObj?.id
        };
      })
      .sort((a: any, b: any) => a.ordem - b.ordem);

    delete route.rota_passageiros;
  } else {
    route.passageiros = [];
  }

  route.ausencias = ausencias || [];
  return route;
};

const listRoutesByUsuario = async (usuarioId: string): Promise<any[]> => {
  if (!usuarioId) throw new AppError("ID do usuário é obrigatório", 400);

  try {
    const { data: routes, error } = await routeRepository.listByUsuario(usuarioId);

    if (error) {
      const { data: fallbackRoutes, error: fbError } = await routeRepository.listByUsuarioFallback(usuarioId);

      if (fbError) return [];
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
  } catch (err) {
    return [];
  }
};

const listExecucoesByUsuario = async (usuarioId: string): Promise<any[]> => {
  if (!usuarioId) throw new AppError("ID do usuário é obrigatório", 400);

  try {
    const { data: execs, error } = await routeRepository.listExecucoesByUsuario(usuarioId);

    if (error) {
      const { data: fallbackExecs } = await routeRepository.listExecucoesByUsuarioFallback(usuarioId);
      return fallbackExecs || [];
    }
    return execs || [];
  } catch (err) {
    return [];
  }
};

const getExecucaoDetail = async (id: string): Promise<any> => {
  const { data: exec, error } = await routeRepository.getExecucaoDetail(id);

  if (error) throw error;
  if (!exec) {
    throw new AppError("Execução de rota não encontrada", 404);
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
        passageiro: erp.passageiro,
        escola: erp.escola
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

  const { data: activeExec, error: checkError } = await routeRepository.getExecucaoAtiva(usuarioId);

  if (checkError) throw checkError;
  if (activeExec) {
    throw new AppError("Você já possui uma rota em andamento. Finalize-a antes de iniciar outra.", 400);
  }

  const route = await getRoute(rotaId);
  if (!route) throw new AppError("Rota não encontrada", 404);
  if (!route.passageiros || route.passageiros.length === 0) {
    throw new AppError("A rota selecionada não possui paradas cadastradas.", 400);
  }

  let inativosContador = 0;
  const paradasValidas = route.passageiros.filter((p: any) => {
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

  const { data: exec, error: execError } = await routeRepository.insertExecucao(rotaId, usuarioId);

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

  const result = await getExecucaoDetail(exec.id);
  return {
    ...result,
    alertaInativos: inativosContador > 0 ? `${inativosContador} passageiro(s) inativo(s) foram desconsiderados nesta corrida.` : null
  };
};

const atualizarParadaStatus = async (
  execucaoId: string,
  paradaId: string,
  novoStatus: RouteStopStatus.EMBARCADO | RouteStopStatus.AUSENTE | RouteStopStatus.PENDENTE
): Promise<any> => {
  if (!execucaoId) throw new AppError("ID da execução é obrigatório", 400);
  if (!paradaId) throw new AppError("ID da parada é obrigatório", 400);

  const { data: exec, error: execError } = await routeRepository.getExecucaoResumida(execucaoId);

  if (execError) throw execError;
  if (exec.status !== RouteExecutionStatus.INICIADA) {
    throw new AppError("Esta rota não está ativa.", 400);
  }

  const { data: paradaObj } = await routeRepository.getParadaById(paradaId);
  const { data: paradaAtualObj } = await routeRepository.getParadaAtualPendente(execucaoId);

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

  return await getExecucaoDetail(execucaoId);
};

const reordenarExecucao = async (execucaoId: string, data: ReorderExecucaoDTO): Promise<any> => {
  if (!execucaoId) throw new AppError("ID da execução é obrigatório", 400);

  for (const item of data.paradas) {
    await routeRepository.updateParadaOrdem(item.id, execucaoId, item.ordem);
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
  return await getExecucaoDetail(execucaoId);
};

const finalizarExecucao = async (execucaoId: string): Promise<any> => {
  if (!execucaoId) throw new AppError("ID da execução é obrigatório", 400);

  const { error } = await routeRepository.updateExecucaoStatus(
    execucaoId,
    RouteExecutionStatus.CONCLUIDA,
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
      acao: AtividadeAcao.ROTA_CONCLUIDA,
      descricao: `Execução da rota "${execDetail.rota?.nome || 'Rota'}" foi concluída com sucesso.`,
      meta: { execucao_id: execucaoId, total_paradas: execDetail.paradas?.length || 0 }
    });
  }

  return execDetail;
};

const registrarAusenciaAntecipada = async (data: CreateAusenciaDTO & { registrado_por?: string }): Promise<any> => {
  if (!data.passageiro_id) throw new AppError("Passageiro é obrigatório", 400);
  if (!data.rota_id) throw new AppError("Rota é obrigatória", 400);
  if (!data.data_ausencia) throw new AppError("Data da ausência é obrigatória", 400);

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
      descricao: `Registrou ausência antecipada para o passageiro "${inserted.passageiro?.nome || 'Passageiro'}" na data ${data.data_ausencia}.`,
      meta: { passageiro_id: data.passageiro_id, rota_id: data.rota_id, data_ausencia: data.data_ausencia }
    });
  }

  return inserted;
};

const removerAusenciaAntecipada = async (id: string, passageiroId?: string, rotaId?: string, dataAusencia?: string): Promise<void> => {
  if (id && id !== DELETE_AUSENCIA_BY_QUERY_PARAM) {
    const { error } = await routeRepository.deleteAusencia(id);
    if (error) throw error;
    return;
  }

  if (passageiroId && rotaId) {
    const targetDate = dataAusencia || getTodayLocalDateStr();
    const { error } = await routeRepository.deleteAusenciaByPassageiroERota(passageiroId, rotaId, targetDate);
    if (error) throw error;
  }
};

const listAusenciasByRota = async (rotaId: string, dataAusencia?: string): Promise<any[]> => {
  if (!rotaId) throw new AppError("ID da rota é obrigatório", 400);
  const targetDate = dataAusencia || new Date().toISOString().split("T")[0];

  const { data: ausencias, error } = await routeRepository.getAusenciasByRotaEData(rotaId, targetDate);
  if (error) throw error;

  return ausencias || [];
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
  atualizarParadaStatus,
  reordenarExecucao,
  cancelarExecucao,
  finalizarExecucao,
  registrarAusenciaAntecipada,
  removerAusenciaAntecipada,
  listAusenciasByRota
};
