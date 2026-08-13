// Aplicação Fastify compartilhada
// Usado tanto para desenvolvimento local quanto para Vercel serverless
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import { fastifyRequestContext } from "@fastify/request-context";
import * as Sentry from "@sentry/node";
import Fastify, { FastifyInstance } from "fastify";
import routes from "./api/routes.js";
import { logger } from "./config/logger.js";
import { env } from "./config/env.js";
import { globalErrorHandler } from "./errors/errorHandler.js";
import { setupBullBoard } from "./queues/bull-board.js";
import { initializeFirebase } from "./config/firebase.js";

export { };
declare module "@fastify/request-context" {
  interface RequestData {
    ip: string;
  }
}

export async function createApp(): Promise<FastifyInstance> {
  try {
    const app = Fastify({
      // No Fastify 5, para passar uma instância do Pino usamos 'loggerInstance'
      loggerInstance: logger as any, 
      disableRequestLogging: true,
      trustProxy: true,
      bodyLimit: 10485760, // 10MB para permitir uploads de imagens de capa maiores
    }) as FastifyInstance;

    app.addHook("onResponse", (request, reply, done) => {
      if (request.method === "OPTIONS") return done();
      request.log.info(`${request.method} ${request.url} - ${reply.statusCode}`);
      done();
    });

    // --- CONTEXT PROVIDER (IP Tracking via Plugin) ---
    // Envolve cada request em um store do AsyncLocalStorage de forma robusta
    await app.register(fastifyRequestContext);

    app.addHook('onRequest', async (request) => {
      const clientIp = request.headers['x-forwarded-for'] || request.headers['x-real-ip'];
      const finalIp = typeof clientIp === 'string'
        ? clientIp.split(',')[0].trim()
        : (Array.isArray(clientIp) ? (clientIp[0] as string).trim() : request.ip);
        
      (request as any).requestContext.set('ip', finalIp);
    });
    
    // Iniciar integração com Sentry para Fastify
    Sentry.setupFastifyErrorHandler(app);
    
    // Global Error Handler
    app.setErrorHandler(globalErrorHandler);

    // Inicializar Firebase Admin SDK (para Push Notifications)
    initializeFirebase();

    // Segurança Defensiva: Proteção de Cabeçalhos HTTP (Helmet)
    await app.register(fastifyHelmet, { global: true });

    // Segurança Defensiva: Limite de Requisições (Rate Limiting por Usuário/IP)
    await app.register(fastifyRateLimit, {
      max: 300,
      timeWindow: "1 minute",
      keyGenerator: (req) => (req as any).user?.id || req.ip,
      errorResponseBuilder: (req, context) => ({
        statusCode: 429,
        error: "Too Many Requests",
        message: `Limite de requisições excedido. Por favor, aguarde ${Math.ceil(context.ttl / 1000)} segundos.`
      })
    });

    const envOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
      : [];

    const defaultOrigins = [
      "http://localhost:8080",
      "https://localhost",
      "capacitor://localhost",
      "http://localhost",
      "https://app.van360.com.br",
      "https://van360.com.br",
      "https://www.van360.com.br"
    ];
    
    const allowedOrigins = Array.from(new Set([...envOrigins, ...defaultOrigins, env.FRONTEND_URL].filter(Boolean)));

    await app.register(fastifyCors, {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          if (process.env.NODE_ENV === "production") {
            callback(null, false);
          } else {
            callback(null, true);
          }
        }
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    });

    // Parser para application/x-www-form-urlencoded (usado pela EfiPay no webhook de cartão)
    app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
      try {
        const result: Record<string, string> = {};
        new URLSearchParams(body as string).forEach((value, key) => {
          result[key] = value;
        });
        done(null, result);
      } catch (err) {
        done(err as Error, undefined);
      }
    });

    // Configurar Bull Board (Dashboard de Filas)
    // Opcional: Adicionar proteção de Basic Auth aqui futuramente
    // Nota: O Bull Board não funciona em ambiente Serverless (Vercel)
    if (!process.env.VERCEL) {
      setupBullBoard(app);
    }

    // Registrar rotas
    await app.register(routes);

    await app.ready();

    return app;
  } catch (error) {
    console.error("[createApp] Erro ao criar aplicação Fastify:", error);
    throw error;
  }
}

// Export default to satisfy Vercel builder if it mistakenly treats this as an entry point
export default async function (req: any, res: any) {
  const app = await createApp();
  await app.ready();
  app.server.emit('request', req, res);
}
