import Fastify from "fastify";
import interRoutes from "./api/bancos/inter/routes";
import { env } from "./config/env";
import { logger } from "./config/logger";

const app = Fastify({ logger });

app.register(interRoutes, { prefix: "/bancos/inter" });

app.listen({ port: Number(env.PORT), host: "0.0.0.0" });
