import { z } from "zod";
import { RouteStopStatus, RouteNodeType, RouteSentido } from "../types/enums.js";



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
  paradas: z.array(routeNodeSchema).optional(),
  horario_inicio: z.string().optional().nullable(),
  horario_fim: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.horario_inicio && data.horario_fim) {
    if (data.horario_fim < data.horario_inicio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Horário de término deve ser posterior ao horário de início",
        path: ["horario_fim"],
      });
    }
  }
});

export const updateRouteSchema = z.object({
  nome: z.string().min(1).optional(),
  veiculo_id: z.string().uuid().optional().nullable(),
  paradas: z.array(routeNodeSchema).optional(),
});

export const stepRouteExecutionSchema = z.object({
  parada_id: z.string().uuid().optional().nullable(),
  passageiro_id: z.string().uuid().optional().nullable(),
  escola_id: z.string().uuid().optional().nullable(),
  status: z.nativeEnum(RouteStopStatus, { message: "Status inválido" })
});

export const reorderExecucaoSchema = z.object({
  paradas: z.array(z.object({
    id: z.string().uuid(),
    ordem: z.number().int()
  }))
});

export const createAusenciaSchema = z.object({
  passageiro_id: z.string().uuid("ID do passageiro é obrigatório"),
  rota_id: z.string().uuid("ID da rota é obrigatório"),
  data_ausencia: z.string().min(1, "Data é obrigatória"),
  sentido: z.nativeEnum(RouteSentido).optional().nullable()
});

export const DELETE_AUSENCIA_BY_QUERY_PARAM = "by-query";