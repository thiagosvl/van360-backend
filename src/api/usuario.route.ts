import { FastifyInstance } from "fastify";
import { AuthController } from "../controllers/auth.controller.js";
import { usuarioResumoController } from "../controllers/usuario-resumo.controller.js";
import { UsuarioController } from "../controllers/usuario.controller.js";
import { verifySupabaseJWT } from "../middleware/auth.js";

export default async function usuarioRoute(app: FastifyInstance) {

    // --- Rotas de Autenticação/Registro ---
    app.post("/registrar", AuthController.registrar);

    // --- Rotas de Usuário ---
    app.patch("/:id", { onRequest: [verifySupabaseJWT] }, UsuarioController.atualizarUsuario);
    app.delete("/:id", { onRequest: [verifySupabaseJWT] }, UsuarioController.deleteAccount);
    
    app.get("/:usuarioId/resumo", usuarioResumoController.getResumo);

}
