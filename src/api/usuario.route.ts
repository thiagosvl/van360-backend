import { FastifyInstance } from "fastify";
import { AuthController } from "../controllers/auth.controller.js";
import { SubscriptionController } from "../controllers/subscription.controller.js";
import { usuarioResumoController } from "../controllers/usuario-resumo.controller.js";
import { UsuarioController } from "../controllers/usuario.controller.js";
import { verifySupabaseJWT } from "../middleware/auth.js";

export default async function usuarioRoute(app: FastifyInstance) {

    // --- Rotas de Autenticação/Registro ---

    app.post("/registrar-plano-essencial", AuthController.registrarPlanoEssencial);
    app.post("/registrar-plano-profissional", AuthController.registrarPlanoProfissional);

    // --- Rotas de Assinatura ---
    app.post("/upgrade-plano", SubscriptionController.upgradePlano);
    app.post("/downgrade-plano", SubscriptionController.downgradePlano);
    app.post("/trocar-subplano", SubscriptionController.trocarSubplano);
    app.post("/criar-assinatura-profissional-personalizado", SubscriptionController.criarAssinaturaPersonalizada);

    // --- Rotas de Usuário ---
    app.patch("/:id", { onRequest: [verifySupabaseJWT] }, UsuarioController.atualizarUsuario);
    app.delete("/:id", { onRequest: [verifySupabaseJWT] }, UsuarioController.deleteAccount);
    


    app.get("/:usuarioId/resumo", usuarioResumoController.getResumo);

}
