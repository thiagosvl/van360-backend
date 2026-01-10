import { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { logger } from "../config/logger.js";
import { AppError } from "./AppError.js";

export function globalErrorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
    const { method, url } = request;

    // 1. Erro Conhecido (AppError ou validações tratadas)
    if (error instanceof AppError) {
        logger.warn({
            msg: "Erro Operacional",
            error: error.message,
            statusCode: error.statusCode,
            method,
            url
        });
        return reply.status(error.statusCode).send({
            status: "error",
            message: error.message
        });
    }

    // 1.5 Erro de Validação Zod
    if (error instanceof ZodError) {
        logger.warn({
            msg: "Erro de Validação (Zod)",
            details: error.issues,
            method,
            url
        });
        return reply.status(400).send({
            status: "error",
            message: "Dados de entrada inválidos.",
            details: error.issues
        });
    }

    // 2. Erros de Validação do Fastify (Schema)
    if (error.validation) {
         logger.warn({
            msg: "Erro de Validação (Schema)",
            error: error.message,
            details: error.validation,
            method,
            url
        });
        return reply.status(400).send({
            status: "error",
            message: "Dados de entrada inválidos.",
            errors: error.validation
        });
    }

    // 3. Erro Desconhecido (Bug / Infra)
    logger.error({
        msg: "Erro Interno (500)",
        error: error.message,
        stack: error.stack,
        method,
        url,
        // Adicione userId se disponível via request.user
        userId: (request as any).user?.id
    });

    return reply.status(500).send({
        status: "error",
        message: "Ocorreu um erro interno no servidor." 
    });
}
