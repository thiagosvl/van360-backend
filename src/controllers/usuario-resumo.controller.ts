import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { usuarioResumoService } from "../services/usuario-resumo.service.js";
import { hasPermission, PERMISSIONS } from "../config/permissions.js";
import { UserType } from "../types/enums.js";

export const usuarioResumoController = {
  getResumo: async (request: FastifyRequest, reply: FastifyReply) => {
    const paramsSchema = z.object({
      usuarioId: z.string().uuid(),
    });

    const { usuarioId } = paramsSchema.parse(request.params);

    const querySchema = z.object({
      mes: z.string().optional(),
      ano: z.string().optional(),
      veiculo_id: z.string().optional(),
    });

    const { mes, ano, veiculo_id } = querySchema.parse(request.query);
    const mesNum = mes ? parseInt(mes) : undefined;
    const anoNum = ano ? parseInt(ano) : undefined;

    const targetOwnerId = request.data_owner_id || usuarioId;
    const targetVeiculoId = request.assigned_veiculo_id || veiculo_id || undefined;

    const userRole = (request.user?.app_metadata?.role || request.profile?.tipo || UserType.MOTORISTA) as UserType;
    const canViewFinancials = hasPermission(userRole, PERMISSIONS.FINANCEIRO_VISUALIZAR);

    const resumo = await usuarioResumoService.getResumo(targetOwnerId, mesNum, anoNum, targetVeiculoId, canViewFinancials);

    return reply.send(resumo);
  },
};
