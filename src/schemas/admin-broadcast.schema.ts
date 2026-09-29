import { z } from "zod";
import { PushNotificationAction } from "../types/enums.js";

export const adminBroadcastEstimateQuerySchema = z.object({
  status: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      if (Array.isArray(val)) return val;
      return val.split(",").map((s) => s.trim()).filter(Boolean);
    }),
  motoristaIds: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      if (Array.isArray(val)) return val;
      return val.split(",").map((s) => s.trim()).filter(Boolean);
    }),
});

export const adminBroadcastSendSchema = z
  .object({
    status: z.array(z.string()).optional(),
    motoristaIds: z.array(z.string().uuid()).optional(),
    titulo: z
      .string()
      .trim()
      .min(3, "O título deve ter no mínimo 3 caracteres.")
      .max(100, "O título deve ter no máximo 100 caracteres."),
    mensagem: z
      .string()
      .trim()
      .min(5, "A mensagem deve ter no mínimo 5 caracteres.")
      .max(500, "A mensagem deve ter no máximo 500 caracteres."),
    action: z.nativeEnum(PushNotificationAction).optional().default(PushNotificationAction.OPEN_HOME),
  })
  .refine(
    (data) =>
      (data.status && data.status.length > 0) ||
      (data.motoristaIds && data.motoristaIds.length > 0),
    {
      message: "Selecione ao menos um grupo ou motorista destinatário.",
      path: ["status"],
    }
  );

export type AdminBroadcastEstimateQuery = z.infer<typeof adminBroadcastEstimateQuerySchema>;
export type AdminBroadcastSendDTO = z.infer<typeof adminBroadcastSendSchema>;
