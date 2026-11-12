import { z } from "zod";
import {
  createRouteSchema,
  updateRouteSchema,
  listRoutesQuerySchema,
  listExecucoesQuerySchema,
  stepRouteExecutionSchema,
  reorderExecucaoSchema,
  createAusenciaSchema,
  chamadaEscolaSchema,
  buscarAlunosQuerySchema,
  DELETE_AUSENCIA_BY_QUERY_PARAM
} from "../../schemas/route.schema.js";

export {
  routeNodeSchema,
  createRouteSchema,
  updateRouteSchema,
  listRoutesQuerySchema,
  listExecucoesQuerySchema,
  stepRouteExecutionSchema,
  reorderExecucaoSchema,
  createAusenciaSchema,
  chamadaEscolaSchema,
  buscarAlunosQuerySchema,
  DELETE_AUSENCIA_BY_QUERY_PARAM
} from "../../schemas/route.schema.js";

export type CreateRouteDTO = z.infer<typeof createRouteSchema>;
export type UpdateRouteDTO = z.infer<typeof updateRouteSchema>;
export type ListRoutesQueryDTO = z.infer<typeof listRoutesQuerySchema>;
export type ListExecucoesQueryDTO = z.infer<typeof listExecucoesQuerySchema>;
export type StepRouteExecutionDTO = z.infer<typeof stepRouteExecutionSchema>;
export type ReorderExecucaoDTO = z.infer<typeof reorderExecucaoSchema>;
export type CreateAusenciaDTO = z.infer<typeof createAusenciaSchema>;
export type ChamadaEscolaDTO = z.infer<typeof chamadaEscolaSchema>;
export type BuscarAlunosQueryDTO = z.infer<typeof buscarAlunosQuerySchema>;

import { RouteExecutionStatus, RouteStopStatus, RouteNodeType, RouteSentido } from "../enums.js";
import type { Tables } from "../database.types.js";

export type ExecucaoUsuarioTimezoneDTO = Pick<
  Tables<"usuarios">,
  "telefone" | "estado" | "metadados_cadastro"
>;

export interface ExecucaoResumidaDTO {
  id: string;
  rota_id: string;
  usuario_id: string;
  status: RouteExecutionStatus;
  notificar_pais?: boolean;
  notificar_inicio_rota?: boolean;
  notificar_proxima_parada?: boolean;
  notificar_conclusao_parada?: boolean;
  rastreamento_ativo?: boolean;
  rastreamento_modo?: string;
  usuario?: ExecucaoUsuarioTimezoneDTO | ExecucaoUsuarioTimezoneDTO[] | null;
}

export interface ExecucaoParadaLeveDTO {
  id: string;
  tipo_no: RouteNodeType;
  status: RouteStopStatus;
  ordem: number;
  passageiro_id: string | null;
  escola_id: string | null;
  sentido: RouteSentido | null;
  notificacao_inicio_enviada: boolean;
  notificacao_a_caminho_enviada: boolean;
  notificacao_concluido_enviada: boolean;
}

export interface AlunoBuscaDTO {
  id: string;
  nome: string;
  turma?: string | null;
  escola_nome?: string | null;
  responsavel_nome?: string | null;
}

export interface AusenciaFuturaDTO {
  id: string;
  data_ausencia: string;
  sentido?: string | null;
  created_at?: string;
  passageiro: {
    id: string;
    nome: string;
    turma?: string | null;
    escola_nome?: string | null;
    responsavel_nome?: string | null;
  } | null;
  rota?: {
    id: string;
    nome: string;
  } | null;
}
