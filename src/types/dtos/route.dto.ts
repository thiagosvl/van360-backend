import { z } from "zod";
import { RouteStopStatus } from "../enums.js";

const optionalString = z.union([z.string(), z.null(), z.undefined()]).transform(v => {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  return v;
});

export const createRouteSchema = z.object({
  usuario_id: z.string().uuid("ID do usuário inválido"),
  nome: z.string().min(1, "Nome é obrigatório"),
  periodo: z.string().min(1, "Período é obrigatório"), // 'manha', 'tarde', 'noite'
  tipo: z.enum(["ida", "volta"], { message: "Tipo de trajeto é obrigatório" }),
  passageiros: z.array(z.object({
    passageiro_id: z.string().uuid(),
    ordem: z.number().int()
  })).optional()
});

export type CreateRouteDTO = z.infer<typeof createRouteSchema>;

export const updateRouteSchema = z.object({
  nome: z.string().min(1).optional(),
  periodo: z.string().min(1).optional(),
  tipo: z.enum(["ida", "volta"]).optional(),
  passageiros: z.array(z.object({
    passageiro_id: z.string().uuid(),
    ordem: z.number().int()
  })).optional()
});

export type UpdateRouteDTO = z.infer<typeof updateRouteSchema>;

export const setRoutePassengersSchema = z.object({
  passageiros: z.array(z.object({
    passageiro_id: z.string().uuid(),
    ordem: z.number().int()
  }))
});

export type SetRoutePassengersDTO = z.infer<typeof setRoutePassengersSchema>;

export const stepRouteExecutionSchema = z.object({
  passageiro_id: z.string().uuid("ID do passageiro inválido"),
  status: z.enum([RouteStopStatus.EMBARCADO, RouteStopStatus.AUSENTE], { message: "Novo status ('embarcado' ou 'ausente') é obrigatório" })
});

export type StepRouteExecutionDTO = z.infer<typeof stepRouteExecutionSchema>;
