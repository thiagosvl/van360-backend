import { z } from 'zod';
import { RouteSentido } from '../enums.js';

export const createResponsavelAusenciaSchema = z.object({
  data_ausencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (formato YYYY-MM-DD)").optional().nullable(),
  data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inicial inválida (formato YYYY-MM-DD)").optional().nullable(),
  data_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data final inválida (formato YYYY-MM-DD)").optional().nullable(),
  rota_id: z.string().uuid("ID de rota inválido").optional().nullable(),
  rotas_ids: z.array(z.string().uuid("ID de rota inválido")).min(1, "Selecione ao menos uma rota").optional().nullable(),
  sentido: z.nativeEnum(RouteSentido).optional().default(RouteSentido.INDO),
  periodo: z.string().optional().nullable(),
  motivo: z.string().max(255, "Motivo muito longo").optional().nullable()
}).refine((data) => Boolean(data.data_ausencia || data.data_inicio), {
  message: "Informe a data da ausência",
  path: ["data_inicio"]
});

export type CreateResponsavelAusenciaDTO = z.infer<typeof createResponsavelAusenciaSchema>;

