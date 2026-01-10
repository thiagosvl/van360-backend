import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { whatsappController } from "../controllers/whatsapp.controller.js";
import { verifySupabaseJWT } from "../middleware/auth.js";

const whatsappRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
    
    app.addHook("preHandler", verifySupabaseJWT);

    // Endpoint: GET /status
    // Retorna status da instância do usuário + status da Evolution
    app.get("/status", whatsappController.status);

    // Endpoint: POST /conectar
    // Inicia conexão e retorna QR Code ou Status Open
    app.post("/conectar", whatsappController.connect);

    // Endpoint: POST /desconectar
    // Faz logout da instância
    app.post("/desconectar", whatsappController.disconnect);
};

export default whatsappRoute;


