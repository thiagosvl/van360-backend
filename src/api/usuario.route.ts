import { FastifyInstance } from "fastify";
import { AuthController } from "../controllers/auth.controller.js";
import { SubscriptionController } from "../controllers/subscription.controller.js";
import { UsuarioController } from "../controllers/usuario.controller.js";

export default async function usuarioRoute(app: FastifyInstance) {

    // --- Rotas de Autenticação/Registro ---
    app.post("/registrar-plano-gratuito", AuthController.registrarPlanoGratuito);
    app.post("/registrar-plano-essencial", AuthController.registrarPlanoEssencial);
    app.post("/registrar-plano-profissional", AuthController.registrarPlanoProfissional);

    // --- Rotas de Assinatura ---
    app.delete("/cancelar-assinatura/:id", SubscriptionController.cancelarAssinatura);
    app.patch("/desistir-cancelar-assinatura/:id", SubscriptionController.desistirCancelarAssinatura);
    app.post("/upgrade-plano", SubscriptionController.upgradePlano);
    app.post("/downgrade-plano", SubscriptionController.downgradePlano);
    app.post("/trocar-subplano", SubscriptionController.trocarSubplano);
    app.post("/criar-assinatura-profissional-personalizado", SubscriptionController.criarAssinaturaPersonalizada);

    // --- Rotas de Usuário ---
    app.patch("/:id", UsuarioController.atualizarUsuario);

}