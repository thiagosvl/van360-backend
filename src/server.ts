import fastifyCors from "@fastify/cors";
import 'dotenv/config';
import Fastify from "fastify";
import routes from "./api/routes";

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
    transport: {
      target: 'pino-pretty',
      options: { colorize: true }
    }
  }
});

// Configuração de CORS para aceitar domínios específicos
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:5173', 'http://localhost:3000'];

app.register(fastifyCors, {
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

app.register(routes);

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3000;
    await app.listen({ port, host: "0.0.0.0" });
    console.log(`Servidor rodando em http://0.0.0.0:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
