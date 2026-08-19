import { z } from "zod";
import {
  createRouteSchema,
  updateRouteSchema,
  stepRouteExecutionSchema,
  reorderExecucaoSchema,
  createAusenciaSchema,
  chamadaEscolaSchema,
  DELETE_AUSENCIA_BY_QUERY_PARAM
} from "../../schemas/route.schema.js";

export {
  routeNodeSchema,
  createRouteSchema,
  updateRouteSchema,
  stepRouteExecutionSchema,
  reorderExecucaoSchema,
  createAusenciaSchema,
  chamadaEscolaSchema,
  DELETE_AUSENCIA_BY_QUERY_PARAM
} from "../../schemas/route.schema.js";

export type CreateRouteDTO = z.infer<typeof createRouteSchema>;
export type UpdateRouteDTO = z.infer<typeof updateRouteSchema>;
export type StepRouteExecutionDTO = z.infer<typeof stepRouteExecutionSchema>;
export type ReorderExecucaoDTO = z.infer<typeof reorderExecucaoSchema>;
export type CreateAusenciaDTO = z.infer<typeof createAusenciaSchema>;
export type ChamadaEscolaDTO = z.infer<typeof chamadaEscolaSchema>;

import { RouteExecutionStatus, RouteStopStatus, RouteNodeType, RouteSentido } from "../enums.js";

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
