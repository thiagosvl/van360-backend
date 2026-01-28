import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { appRoutes } from "./app.routes.js";
import assinaturaCobrancaRoute from "./assinatura-cobranca.route.js";
import authRoutes from "./auth.routes.js";
import cobrancaRoutes from "./cobranca.routes.js";
import escolaRoutes from "./escola.routes.js";
import evolutionRoute from "./evolution.routes.js";
import gastoRoute from "./gasto.route.js";
import { jobsRoute } from "./jobs.route.js";
import mockPagamentoRoute from "./mock-pagamento.routes.js";
import passageiroRoutes from "./passageiro.routes.js";
import paymentWebhookRoutes from "./payment-webhook.routes.js";
import paymentRoutes from "./payment.routes.js";
import planoRoutes from "./plano.routes.js";
import prePassageiroRoutes from "./pre-passageiro.routes.js";
import profileRoutes from "./profile.routes.js";
import publicRoutes from "./public.routes.js";
import usuarioRoute from "./usuario.route.js";
import veiculoRoutes from "./veiculo.routes.js";

const routes: FastifyPluginAsync = async (app: FastifyInstance) => {

  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(profileRoutes, { prefix: "/api" }); 
  app.register(appRoutes, { prefix: "/api/app" });
  app.register(publicRoutes, { prefix: "/api/public" });
  app.register(usuarioRoute, { prefix: "/api/usuarios" });

  app.register(planoRoutes, { prefix: "/api/planos" });

  // Gateway de Pagamento Genérico
  app.register(paymentRoutes, { prefix: "/api/pagamento" });
  app.register(paymentWebhookRoutes, { prefix: "/api/webhook/pagamento" });
  
  app.register(mockPagamentoRoute, { prefix: "/api" });

  app.register(cobrancaRoutes, { prefix: "/api/cobrancas" });

  app.register(passageiroRoutes, { prefix: "/api/passageiros" });
  
  app.register(prePassageiroRoutes, { prefix: "/api/pre-passageiros" });

  app.register(veiculoRoutes, { prefix: "/api/veiculos" });
  
  app.register(escolaRoutes, { prefix: "/api/escolas" });

  app.register(gastoRoute, { prefix: "/api/gastos" });

  app.register(assinaturaCobrancaRoute, { prefix: "/api/assinatura-cobrancas" });
  
  // Rotas de Jobs (Automação)
  app.register(jobsRoute, { prefix: "/api/jobs" });

  // Webhook da Evolution
  app.register(evolutionRoute, { prefix: "/api/evolution" });
};

export default routes;
