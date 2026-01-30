import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { usuarioResumoService } from "../services/usuario-resumo.service.js";

export const usuarioResumoController = {
  getResumo: async (request: FastifyRequest, reply: FastifyReply) => {
    // Validate Params
    const paramsSchema = z.object({
      usuarioId: z.string().uuid(),
    });

    const { usuarioId } = paramsSchema.parse(request.params);

    // Validate Query
    const querySchema = z.object({
      mes: z.string().optional(),
      ano: z.string().optional(),
    });

    const { mes, ano } = querySchema.parse(request.query);
    const mesNum = mes ? parseInt(mes) : undefined;
    const anoNum = ano ? parseInt(ano) : undefined;

    const resumo = await usuarioResumoService.getResumo(usuarioId, mesNum, anoNum);

    return reply.send(resumo);
  },
};
