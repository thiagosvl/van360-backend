import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { whatsappController } from "../controllers/whatsapp.controller.js";
import { verifySupabaseJWT } from "../middleware/auth.js";

const whatsappRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
    
    app.addHook("preHandler", verifySupabaseJWT);

    // Endpoint: GET /status
    // Retorna status da instância do usuário + status da Evolution
    app.get("/status", whatsappController.status);

    // Endpoint: POST /connect
    // Inicia conexão e retorna QR Code ou Status Open
    app.post("/connect", whatsappController.connect);

    // Endpoint: POST /disconnect
    // Faz logout da instância
    app.post("/disconnect", whatsappController.disconnect);
};

export default whatsappRoute;


