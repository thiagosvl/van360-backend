import { z } from "zod";
import { RouteStopStatus, RouteNodeType, RouteSentido } from "../enums.js";

const optionalString = z.union([z.string(), z.null(), z.undefined()]).transform(v => {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  return v;
});

export const routeNodeSchema = z.object({
  tipo_no: z.nativeEnum(RouteNodeType).default(RouteNodeType.PASSAGEIRO),
  passageiro_id: z.string().uuid().optional().nullable(),
  escola_id: z.string().uuid().optional().nullable(),
  ordem: z.number().int(),
  sentido: z.nativeEnum(RouteSentido).optional().nullable()
});

export const createRouteSchema = z.object({
  usuario_id: z.string().uuid("ID do usuário inválido"),
  nome: z.string().min(1, "Nome é obrigatório"),
  veiculo_id: z.string().uuid().optional().nullable(),
  passageiros: z.array(routeNodeSchema).optional(),
  horario_inicio: optionalString,
  horario_fim: optionalString,
  horario_termino: optionalString,
  horario_saida: optionalString,
  horario_chegada: optionalString,
  hora_inicio: optionalString,
  hora_fim: optionalString,
}).refine(data => {
  const inicio = data.horario_inicio || data.hora_inicio || data.horario_saida;
  const fim = data.horario_fim || data.horario_termino || data.hora_fim || data.horario_chegada;
  if (inicio && fim) {
    return fim >= inicio;
  }
  return true;
}, {
  message: "Horário de término não pode ser anterior ao horário de início",
  path: ["horario_fim"],
});

export type CreateRouteDTO = z.infer<typeof createRouteSchema>;

export const updateRouteSchema = z.object({
  nome: z.string().min(1).optional(),
  veiculo_id: z.string().uuid().optional().nullable(),
  passageiros: z.array(routeNodeSchema).optional(),
  horario_inicio: optionalString,
  horario_fim: optionalString,
  horario_termino: optionalString,
  horario_saida: optionalString,
  horario_chegada: optionalString,
  hora_inicio: optionalString,
  hora_fim: optionalString,
}).refine(data => {
  const inicio = data.horario_inicio || data.hora_inicio || data.horario_saida;
  const fim = data.horario_fim || data.horario_termino || data.hora_fim || data.horario_chegada;
  if (inicio && fim) {
    return fim >= inicio;
  }
  return true;
}, {
  message: "Horário de término não pode ser anterior ao horário de início",
  path: ["horario_fim"],
});

export type UpdateRouteDTO = z.infer<typeof updateRouteSchema>;

export const stepRouteExecutionSchema = z.object({
  passageiro_id: z.string().uuid().optional().nullable(),
  escola_id: z.string().uuid().optional().nullable(),
  status: z.nativeEnum(RouteStopStatus, { message: "Status inválido" })
});

export type StepRouteExecutionDTO = z.infer<typeof stepRouteExecutionSchema>;

export const reorderExecucaoSchema = z.object({
  paradas: z.array(z.object({
    id: z.string().uuid(),
    ordem: z.number().int()
  }))
});

export type ReorderExecucaoDTO = z.infer<typeof reorderExecucaoSchema>;

export const createAusenciaSchema = z.object({
  passageiro_id: z.string().uuid("ID do passageiro é obrigatório"),
  rota_id: z.string().uuid("ID da rota é obrigatório"),
  data_ausencia: z.string().min(1, "Data é obrigatória"),
  sentido: z.nativeEnum(RouteSentido).optional().nullable()
});

export type CreateAusenciaDTO = z.infer<typeof createAusenciaSchema>;

export const DELETE_AUSENCIA_BY_QUERY_PARAM = "by-query";
