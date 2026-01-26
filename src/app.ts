// Aplicação Fastify compartilhada
// Usado tanto para desenvolvimento local quanto para Vercel serverless
import fastifyCors from "@fastify/cors";
import Fastify, { FastifyInstance } from "fastify";
import routes from "./api/routes.js";
import { globalErrorHandler } from "./errors/errorHandler.js";
import { setupBullBoard } from "./queues/bull-board.js";

export async function createApp(): Promise<FastifyInstance> {
  try {
    const app = Fastify({
      logger: {
        level: process.env.LOG_LEVEL || "info",
        transport:
          process.env.NODE_ENV === "development"
            ? {
                target: "pino-pretty",
                options: { colorize: true },
              }
            : undefined,
      },
      disableRequestLogging: true,
    });
    
    // Global Error Handler
    app.setErrorHandler(globalErrorHandler);

    // Configuração de CORS
    const envOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
      : [];

    const defaultOrigins = [
      "http://localhost:5173", 
      "http://localhost:8080",
      "https://localhost", // Android Capacitor
      "capacitor://localhost", // iOS Capacitor
      "http://localhost" // Web/General
    ];
    
    // Merge unique origins
    const allowedOrigins = Array.from(new Set([...envOrigins, ...defaultOrigins]));

    await app.register(fastifyCors, {
      origin: (origin, callback) => {
        // Permitir requisições sem origin (mobile apps, Postman, etc)
        if (!origin) return callback(null, true);

        // Verificar se a origin está na lista de permitidas
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          // Em produção, rejeitar origens não permitidas
          if (process.env.NODE_ENV === "production") {
            callback(new Error("Not allowed by CORS"), false);
          } else {
            // Em desenvolvimento, permitir qualquer origem
            callback(null, true);
          }
        }
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
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

