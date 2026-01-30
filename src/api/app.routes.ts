import { FastifyInstance } from "fastify";
import { AppController } from "../controllers/app.controller.js";
import authRoutes from "./auth.routes.js";
import cobrancaRoutes from "./cobranca.routes.js";
import escolaRoutes from "./escola.routes.js";
import evolutionRoutes from "./evolution.routes.js";
import mockPagamentoRoute from "./mock-pagamento.routes.js";
import passageiroRoutes from "./passageiro.routes.js";
import paymentRoutes from "./payment.routes.js";
import planoRoutes from "./plano.routes.js";
import prePassageiroRoutes from "./pre-passageiro.routes.js";
import profileRoutes from "./profile.routes.js";
import publicRoutes from "./public.routes.js";
import veiculoRoutes from "./veiculo.routes.js";

export async function appRoutes(app: FastifyInstance) {
  // Public routes
  app.register(publicRoutes);
  
  // OTA Updates
  app.get("/updates", AppController.checkUpdates);
  
  // Auth routes
  app.register(authRoutes, { prefix: "/auth" });
  
  // Protected routes
  app.register(async (protectedApp) => {
    protectedApp.register(passageiroRoutes, { prefix: "/passageiros" });
    protectedApp.register(veiculoRoutes, { prefix: "/veiculos" });
    protectedApp.register(escolaRoutes, { prefix: "/escolas" });
    protectedApp.register(cobrancaRoutes, { prefix: "/cobrancas" });
    protectedApp.register(paymentRoutes, { prefix: "/pagamento" });
    protectedApp.register(evolutionRoutes, { prefix: "/evolution" });
    protectedApp.register(profileRoutes, { prefix: "/profile" });
    protectedApp.register(planoRoutes, { prefix: "/planos" });
    protectedApp.register(prePassageiroRoutes, { prefix: "/pre-passageiros" });
  });

  // Test routes
  app.register(mockPagamentoRoute);
}
