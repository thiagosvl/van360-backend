import { z } from "zod";

export const listAdminInvoicesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.string().optional(),
  user_status: z.string().optional(),
  metodo: z.string().optional(),
  tipo: z.string().optional(),
  vencimento_de: z.string().optional(),
  vencimento_ate: z.string().optional(),
});

export type ListAdminInvoicesQuery = z.infer<typeof listAdminInvoicesQuerySchema>;
