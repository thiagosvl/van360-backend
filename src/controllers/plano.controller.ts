import { FastifyReply, FastifyRequest } from "fastify";
import { planoService } from "../services/plano.service.js";

export const planoController = {
  list: async (request: FastifyRequest, reply: FastifyReply) => {
    const filtros = request.query as any;
    const planos = await planoService.listPlanos(filtros);
    return reply.status(200).send(planos);
  },

  calcularPrecoPreview: async (request: FastifyRequest, reply: FastifyReply) => {
    const { quantidade, ignorarMinimo } = request.body as { quantidade: number; ignorarMinimo?: boolean };

    if (!quantidade || typeof quantidade !== "number") {
      return reply.status(400).send({
        error: "Quantidade é obrigatória e deve ser um número",
      });
    }

    const resultado = await planoService.calcularPrecoPreview(quantidade, ignorarMinimo);
    return reply.status(200).send(resultado ? { preco: resultado.precoTotal, valorPorCobranca: resultado.valorPorCobranca } : { preco: null });
  }
};
