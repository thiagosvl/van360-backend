import { z } from "zod";

export const createGastoCategoriaSchema = z.object({
  usuario_id: z.string().uuid().optional(),
  nome: z.string().min(2).max(50),
  cor: z.string().min(2).max(20).optional().default("slate"),
  icone: z.string().min(2).max(30).optional().default("Tag")
});

export const updateGastoCategoriaSchema = createGastoCategoriaSchema.partial().omit({ usuario_id: true });

export type CreateGastoCategoriaDTO = z.infer<typeof createGastoCategoriaSchema>;
export type UpdateGastoCategoriaDTO = z.infer<typeof updateGastoCategoriaSchema>;
