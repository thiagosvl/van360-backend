// Handler para Vercel Serverless Functions
// Este arquivo é o ponto de entrada para a Vercel
// NOTA: Na Vercel, as variáveis de ambiente são injetadas automaticamente
// Não precisa usar dotenv aqui, apenas process.env
import fastifyCors from "@fastify/cors";
import Fastify, { FastifyInstance } from "fastify";
import routes from "../src/api/routes.js";
import { IncomingMessage, ServerResponse } from "http";

let app: FastifyInstance | null = null;

async function createApp(): Promise<FastifyInstance> {
  if (app) return app;

  app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
    },
    disableRequestLogging: false,
  });

  // Configuração de CORS para aceitar domínios específicos
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
    : ['http://localhost:5173', 'http://localhost:3000'];

  await app.register(fastifyCors, {
    origin: (origin, callback) => {
      // Permitir requisições sem origin (mobile apps, Postman, etc)
      if (!origin) return callback(null, true);
      
      // Verificar se a origin está na lista de permitidas
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        // Em produção, rejeitar origens não permitidas
        if (process.env.NODE_ENV === 'production') {
          callback(new Error('Not allowed by CORS'), false);
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

  await app.register(routes);
  await app.ready();

  return app;
}

// Handler para Vercel Serverless Functions
// A Vercel espera uma função que recebe req e res do Node.js padrão
// O Fastify precisa processar através do seu servidor HTTP interno
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const fastifyApp = await createApp();
    
    // O Fastify precisa processar a requisição através do seu servidor HTTP
    // Usamos o método routing() que processa req/res do Node.js
    await new Promise<void>((resolve, reject) => {
      // Verificar se a resposta já foi enviada
      if (res.headersSent) {
        resolve();
        return;
      }

      // Processar a requisição através do servidor do Fastify
      if (fastifyApp.server) {
        fastifyApp.server.emit('request', req, res);
        
        // Aguardar a resposta ser enviada
        res.once('finish', resolve);
        res.once('close', resolve);
        
        // Timeout de segurança
        setTimeout(() => {
          if (!res.headersSent) {
            reject(new Error('Request timeout'));
          } else {
            resolve();
          }
        }, 30000); // 30 segundos
      } else {
        reject(new Error('Fastify server not initialized'));
      }
    });
  } catch (error) {
    console.error('Error in handler:', error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ 
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined
      }));
    }
  }
}

