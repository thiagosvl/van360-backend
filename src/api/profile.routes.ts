import { FastifyInstance } from "fastify";
import { ProfileController } from "../controllers/profile.controller.js";
import { verifySupabaseJWT } from "../middleware/auth.js";

export default async function profileRoutes(app: FastifyInstance) {
    app.get("/me/profile", { onRequest: [verifySupabaseJWT] }, ProfileController.getProfile);
}
