import { z } from "zod";

/**
 * Schema para validar payload de webhook PIX (Padrão Bacen)
 * Usado pelo C6 e Inter (v2)
 */
export const pixWebhookSchema = z.object({
  pix: z.array(
    z.object({
      endToEndId: z.string(),
      txid: z.string(),
      valor: z.string(),
      horario: z.string(),
      infoPagador: z.string().optional(),
    })
  ).optional(),
  // Fallback para quando o banco envia um objeto único em vez de array
  txid: z.string().optional(),
  valor: z.string().optional(),
  endToEndId: z.string().optional(),
  horario: z.string().optional(),
}).passthrough();

export type PixWebhookDTO = z.infer<typeof pixWebhookSchema>;
