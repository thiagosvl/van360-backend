import { FastifyInstance } from "fastify";
import { AuthController } from "../controllers/auth.controller.js";
import { verifySupabaseJWT } from "../middleware/auth.js";

export default async function authRoutes(app: FastifyInstance) {
    app.post("/login", AuthController.login);
    app.post("/login/responsavel", AuthController.loginResponsavel);
    app.post("/reset-password", AuthController.resetPassword);
    app.post("/update-password", { onRequest: [verifySupabaseJWT] }, AuthController.updatePassword);
    app.post("/logout", { onRequest: [verifySupabaseJWT] }, AuthController.logout);
    app.post("/refresh", AuthController.refresh);
}
