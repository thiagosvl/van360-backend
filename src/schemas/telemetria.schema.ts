import { z } from "zod";
import { AtividadeAcao, AtividadeEntidadeTipo } from "../types/enums.js";

export const registrarEventoSchema = z.object({
  acao: z.nativeEnum(AtividadeAcao),
  entidade_tipo: z.nativeEnum(AtividadeEntidadeTipo).optional(),
  entidade_id: z.string().uuid().optional(),
  descricao: z.string().max(255).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export type RegistrarEventoInput = z.infer<typeof registrarEventoSchema>;
