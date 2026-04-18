import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { appRoutes } from "./app.routes.js";
import authRoutes from "./auth.routes.js";
import cobrancaRoutes from "./cobranca.routes.js";
import { contractRoutes } from "./contract.routes.js";
import escolaRoutes from "./escola.routes.js";
import evolutionRoute from "./evolution.routes.js";
import gastoRoute from "./gasto.route.js";
import historicoRoute from "./historico.routes.js";
import { jobsRoute } from "./jobs.route.js";
import passageiroRoutes from "./passageiro.routes.js";
import prePassageiroRoutes from "./pre-passageiro.routes.js";
import profileRoutes from "./profile.routes.js";
import publicRoutes from "./public.routes.js";
import subscriptionRoutes from "./subscription.routes.js";
import usuarioRoute from "./usuario.route.js";
import veiculoRoutes from "./veiculo.routes.js";

import { checkSubscriptionAccess } from "../middleware/subscription.js";
import { WebhookController } from "./webhook.controller.js";

const routes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Middleware Global para Bloqueio de Escrita por Assinatura Expirada
  // (Depende do `onRequest: authenticate` estar em cada arquivo de rota)
  app.addHook("preHandler", checkSubscriptionAccess);

  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(profileRoutes, { prefix: "/api" });
  app.register(appRoutes, { prefix: "/api/app" });
  app.register(publicRoutes, { prefix: "/api/public" });
  app.register(usuarioRoute, { prefix: "/api/usuarios" });

  // Assinaturas SaaS (Gestão do Motorista)
  app.register(subscriptionRoutes, { prefix: "/api/subscriptions" });

  app.register(cobrancaRoutes, { prefix: "/api/cobrancas" });
  app.register(passageiroRoutes, { prefix: "/api/passageiros" });
  app.register(prePassageiroRoutes, { prefix: "/api/pre-passageiros" });
  app.register(veiculoRoutes, { prefix: "/api/veiculos" });
  app.register(escolaRoutes, { prefix: "/api/escolas" });
  app.register(gastoRoute, { prefix: "/api/gastos" });

  // Rotas de Contratos
  app.register(contractRoutes, { prefix: "/api" });

  app.register(jobsRoute, { prefix: "/api/jobs" });

  // Webhook da Evolution
  app.register(evolutionRoute, { prefix: "/api/evolution" });

  // Histórico de Atividades
  app.register(historicoRoute, { prefix: "/api/historico" });

  // Webhook unificado da Efí Pay (PIX e Cartão)
  app.post("/api/webhooks/efi", WebhookController.handleEfipay);
  app.post("/api/webhooks/efi/*", WebhookController.handleEfipay);

};

export default routes;

