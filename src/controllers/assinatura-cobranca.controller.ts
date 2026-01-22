import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { assinaturaCobrancaService } from "../services/assinatura-cobranca.service.js";

export const assinaturaCobrancaController = {
    async get(request: FastifyRequest, reply: FastifyReply) {
        try {
            const id = (request.params as any).id;
            const result = await assinaturaCobrancaService.getAssinaturaCobranca(id);
            return reply.status(200).send(result);
        } catch (err: any) {
            return reply.status(404).send({ error: err.message });
        }
    },

    async checkStatus(request: FastifyRequest, reply: FastifyReply) {
        try {
            const id = (request.params as any).id;
            const result = await assinaturaCobrancaService.getCobrancaStatus(id);
            return reply.status(200).send(result);
        } catch (err: any) {
            return reply.status(404).send({ error: err.message });
        }
    },

    async list(request: FastifyRequest, reply: FastifyReply) {
        const filtros = request.query as any;

        try {
            const result = await assinaturaCobrancaService.listAssinaturaCobrancas(filtros);
            return reply.status(200).send(result);
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    },

    async gerarPix(request: FastifyRequest, reply: FastifyReply) {
        const cobrancaId = (request.params as any).id;

        try {
            const result = await assinaturaCobrancaService.gerarPixParaCobranca(cobrancaId);
            return reply.status(200).send(result);
        } catch (err: any) {
            logger.error({ error: err.message, cobrancaId }, "Erro ao gerar PIX para cobrança");
            
            const statusCode = err.message.includes("não encontrada") 
                ? 404 
                : err.message.includes("não está pendente") 
                ? 400 
                : 500;

            return reply.status(statusCode).send({ error: err.message });
        }
    }
};
