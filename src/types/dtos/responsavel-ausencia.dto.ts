import { z } from 'zod';
import { RouteSentido } from '../enums.js';

export const createResponsavelAusenciaSchema = z.object({
  data_ausencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (formato YYYY-MM-DD)"),
  rota_id: z.string().uuid("ID de rota inválido").optional().nullable(),
  sentido: z.nativeEnum(RouteSentido).optional().default(RouteSentido.INDO),
  periodo: z.string().optional().nullable(),
  motivo: z.string().max(255, "Motivo muito longo").optional().nullable()
});

export type CreateResponsavelAusenciaDTO = z.infer<typeof createResponsavelAusenciaSchema>;
