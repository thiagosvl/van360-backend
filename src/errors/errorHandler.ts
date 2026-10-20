import * as Sentry from "@sentry/node";
import { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { logger } from "../config/logger.js";
import { errorAlertService } from "../services/error-alert.service.js";
import { AppError } from "./AppError.js";
import { extractErrorMessage, extractErrorStack } from "../utils/error.utils.js";

export function globalErrorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
    const { method, url } = request;

    if (error instanceof AppError || error.name === 'AppError' || (error as { isOperational?: boolean }).isOperational) {
        const statusCode = (error as { statusCode?: number }).statusCode || 500;
        const message = error.message || "Erro desconhecido";
        
        const logMethod = statusCode >= 500 ? 'error' : 'warn';

        if (statusCode >= 500) {
            Sentry.captureException(error);
            (request as FastifyRequest & { __errorAlertDispatched?: boolean }).__errorAlertDispatched = true;

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

    const errObj = error as unknown as Record<string, unknown>;
    if (errObj?.code === "PGRST103" || String(errObj?.message || "").includes("Requested range not satisfiable")) {
        logger.warn({
            msg: "Range Not Satisfiable (PGRST103)",
            details: errObj.details || errObj.message,
            method,
            url
        });
        return reply.status(200).send({
            list: [],
            data: [],
            total: 0,
            page: 1,
            totalPages: 0,
            message: "Página solicitada fora dos limites existentes."
        });
    }

    Sentry.captureException(error);
    (request as FastifyRequest & { __errorAlertDispatched?: boolean }).__errorAlertDispatched = true;
    void errorAlertService.notifyHttpError({
        error,
        method,
        url,
        statusCode: 500,
        userId: request.user?.id
    });

    const errorMessage = extractErrorMessage(error);
    const errorStack = extractErrorStack(error);

    logger.error({
        msg: "Erro Interno (500)",
        error: errorMessage,
        stack: errorStack,
        method,
        url,
        userId: request.user?.id
    });

    return reply.status(500).send({
        status: "error",
        message: "Ocorreu um erro interno no servidor." 
    });
}
