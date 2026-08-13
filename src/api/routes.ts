import { FastifyInstance, FastifyPluginAsync } from "fastify";
import adminRoutes from "./admin.routes.js";
import { appRoutes } from "./app.routes.js";
import authRoutes from "./auth.routes.js";
import cobrancaRoutes from "./cobranca.routes.js";
import { contractRoutes } from "./contract.routes.js";
import escolaRoutes from "./escola.routes.js";
import evolutionRoute from "./evolution.routes.js";
import gastoRoute from "./gasto.route.js";
import gastoCategoriaRoute from "./gasto-categoria.routes.js";
import historicoRoute from "./historico.routes.js";
import { jobsRoute } from "./jobs.route.js";
import passageiroRoutes from "./passageiro.routes.js";
import routeRoutes from "./route.routes.js";
import prePassageiroRoutes from "./pre-passageiro.routes.js";
import profileRoutes from "./profile.routes.js";
import publicRoutes from "./public.routes.js";
import subscriptionRoutes from "./subscription.routes.js";
import usuarioRoute from "./usuario.route.js";
import veiculoRoutes from "./veiculo.routes.js";

import configuracoesRoutes from "./configuracoes.routes.js";
import motoristaEquipeRoutes from "./motorista-equipe.routes.js";
import { responsavelPublicRoutes } from "./responsavel.routes.js";
import { checkSubscriptionAccess } from "../middleware/subscription.js";
import { WebhookController } from "./webhook.controller.js";
import notificationRoutes from "./notification.routes.js";
import { wabaWebhookController } from "../controllers/waba-webhook.controller.js";

const routes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Middleware Global para Bloqueio de Escrita por Assinatura Expirada
  // (Depende do `onRequest: authenticate` estar em cada arquivo de rota)
  app.addHook("preHandler", checkSubscriptionAccess);

  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(adminRoutes, { prefix: "/api/admin" });
  app.register(profileRoutes, { prefix: "/api" });
  app.register(configuracoesRoutes, { prefix: "/api" });
  app.register(appRoutes, { prefix: "/api/app" });
  app.register(publicRoutes, { prefix: "/api/public" });
  app.register(responsavelPublicRoutes, { prefix: "/api/public/responsavel" });
  app.register(usuarioRoute, { prefix: "/api/usuarios" });
  app.register(motoristaEquipeRoutes, { prefix: "/api/motoristas-equipe" });

  // Assinaturas SaaS (Gestão do Motorista)
  app.register(subscriptionRoutes, { prefix: "/api/subscriptions" });

  app.register(cobrancaRoutes, { prefix: "/api/cobrancas" });
  app.register(passageiroRoutes, { prefix: "/api/passageiros" });
  app.register(routeRoutes, { prefix: "/api/routes" });
  app.register(prePassageiroRoutes, { prefix: "/api/pre-passageiros" });
  app.register(veiculoRoutes, { prefix: "/api/veiculos" });
  app.register(escolaRoutes, { prefix: "/api/escolas" });
  app.register(gastoRoute, { prefix: "/api/gastos" });
  app.register(gastoCategoriaRoute, { prefix: "/api/gasto-categorias" });

  // Rotas de Contratos
  app.register(contractRoutes, { prefix: "/api" });

  app.register(jobsRoute, { prefix: "/api/jobs" });

  // Webhook da Evolution
  app.register(evolutionRoute, { prefix: "/api/evolution" });

  // Histórico de Atividades
  app.register(historicoRoute, { prefix: "/api/historico" });

  // Notificações Push
  app.register(notificationRoutes, { prefix: "/api/notifications" });

  // Webhook unificado da Efí Pay (PIX e Cartão)
  app.post("/api/webhooks/efi", { config: { rateLimit: false } }, WebhookController.handleEfipay);
  app.post("/api/webhooks/efi/*", { config: { rateLimit: false } }, WebhookController.handleEfipay);

  // Webhook da Meta WABA (WhatsApp Cloud API)
  app.get("/api/webhooks/waba", { config: { rateLimit: false } }, wabaWebhookController.verify);
  app.post("/api/webhooks/waba", { config: { rateLimit: false } }, wabaWebhookController.handle);
};

export default routes;

