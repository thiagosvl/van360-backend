import { FastifyInstance, FastifyPluginAsync } from "fastify";
import assinaturaCobrancaRoute from "./assinatura-cobranca.route";
import cobrancaRoute from "./cobranca.routes";
import escolaRoute from "./escola.routes";
import gastoRoute from "./gasto.route";
import interRoutes from "./inter.routes";
import mockPagamentoRoute from "./mock-pagamento.routes";
import passageiroRoute from "./passageiro.routes";
import planoRoute from "./plano.routes";
import prePassageiroRoute from "./pre-passageiro.routes";
import usuarioRoute from "./usuario.route";
import veiculoRoute from "./veiculo.routes";
import webhookInterRoute from "./webhook-inter.route";

const routes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.register(usuarioRoute, { prefix: "/api/usuarios" });

  app.register(planoRoute, { prefix: "/api/planos" });

  app.register(interRoutes, { prefix: "/api/inter" });

  app.register(webhookInterRoute, { prefix: "/api/inter/webhook" });
  
  app.register(mockPagamentoRoute, { prefix: "/api" });

  app.register(cobrancaRoute, { prefix: "/api/cobrancas" });

  app.register(passageiroRoute, { prefix: "/api/passageiros" });
  
  app.register(prePassageiroRoute, { prefix: "/api/pre-passageiros" });

  app.register(veiculoRoute, { prefix: "/api/veiculos" });
  
  app.register(escolaRoute, { prefix: "/api/escolas" });

  app.register(gastoRoute, { prefix: "/api/gastos" });

  app.register(assinaturaCobrancaRoute, { prefix: "/api/assinatura-cobrancas" });
};

export default routes;
