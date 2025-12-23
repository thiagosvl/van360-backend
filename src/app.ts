// Aplicação Fastify compartilhada
// Usado tanto para desenvolvimento local quanto para Vercel serverless
import fastifyCors from "@fastify/cors";
import Fastify, { FastifyInstance } from "fastify";
import routes from "./api/routes.js";

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
    });

    // Configuração de CORS
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
      : ["http://localhost:5173", "http://localhost:8080"];

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

