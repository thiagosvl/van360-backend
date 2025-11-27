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

app.register(fastifyCors, { origin: "*",  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], });

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
