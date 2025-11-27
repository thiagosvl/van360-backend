// Handler para Vercel Serverless Functions
// Este arquivo é o ponto de entrada para a Vercel
// NOTA: Na Vercel, as variáveis de ambiente são injetadas automaticamente
// Não precisa usar dotenv aqui, apenas process.env
import fastifyCors from "@fastify/cors";
import Fastify from "fastify";
import routes from "../src/api/routes.js";

let app: Fastify.FastifyInstance | null = null;

async function createApp() {
  if (app) return app;

  app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
    },
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

// Exportar handler para Vercel
// A Vercel passa req e res do Node.js padrão
export default async (req: any, res: any) => {
  const fastifyApp = await createApp();
  
  // Converter req/res do Node.js para o formato do Fastify
  fastifyApp.server.emit('request', req, res);
};

