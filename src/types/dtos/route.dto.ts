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
