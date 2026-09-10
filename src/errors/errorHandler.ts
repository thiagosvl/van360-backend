import * as Sentry from "@sentry/node";
import { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { logger } from "../config/logger.js";
import { errorAlertService } from "../services/error-alert.service.js";
import { AppError } from "./AppError.js";

export function globalErrorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
    const { method, url } = request;

    // 1. Erro Conhecido (AppError ou validações tratadas)
    // Check for instanceof OR duck typing (if serialized or prototype lost)
    if (error instanceof AppError || error.name === 'AppError' || (error as { isOperational?: boolean }).isOperational) {
        const statusCode = (error as { statusCode?: number }).statusCode || 500;
        const message = error.message || "Erro desconhecido";
        
        const logMethod = statusCode >= 500 ? 'error' : 'warn';

        if (statusCode >= 500) {
            Sentry.captureException(error);
            void errorAlertService.notifyHttpError({
                error,
                method,
                url,
                statusCode,
                userId: request.user?.id
            });
        }

        logger[logMethod]({
            msg: "Erro Operacional",
            error: message,
            statusCode: statusCode,
            method,
            url
        });
        return reply.status(statusCode).send({
            status: "error",
            message: message
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

    Sentry.captureException(error);
    void errorAlertService.notifyHttpError({
        error,
        method,
        url,
        statusCode: 500,
        userId: request.user?.id
    });

    logger.error({
        msg: "Erro Interno (500)",
        error: error.message,
        stack: error.stack,
        method,
        url,
        userId: request.user?.id
    });

    return reply.status(500).send({
        status: "error",
        message: "Ocorreu um erro interno no servidor." 
    });
}
