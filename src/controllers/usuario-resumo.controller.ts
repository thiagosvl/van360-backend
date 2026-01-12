import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { usuarioResumoService } from "../services/usuario-resumo.service.js";

export const usuarioResumoController = {
  getResumo: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Validate Params
      const paramsSchema = z.object({
        usuarioId: z.string().uuid(),
      });

      const { usuarioId } = paramsSchema.parse(request.params);

      // Verify Permission (Optional: Check if request.user.id === usuarioId or is Admin)
      // request.user is populated by auth middleware usually.
      // const requesterId = (request.user as any)?.id;
      // if (requesterId !== usuarioId && role !== 'admin') ...

      const resumo = await usuarioResumoService.getResumo(usuarioId);

      return reply.send(resumo);
    } catch (error: any) {
      request.log.error(error);
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: "Dados inválidos", details: (error as any).errors });
      }
      return reply.status(500).send({ error: "Erro ao buscar resumo do usuário" });
    }
  },
};
