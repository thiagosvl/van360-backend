import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { historicoController } from "../controllers/historico.controller.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.middleware.js";

const historicoRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
    app.addHook("onRequest", authenticate);

    // Buscar histórico de uma entidade específica (ex: uma cobrança, um passageiro)
    app.get(
        "/entidade/:entidadeTipo/:entidadeId",
        { preHandler: [requirePermission("relatorios.visualizar")] },
        historicoController.listByEntidade
    );
    
    // Buscar histórico geral de um usuário motorista
    app.get(
        "/usuario/:usuarioId",
        { preHandler: [requirePermission("relatorios.visualizar")] },
        historicoController.listByUsuario
    );
};

export default historicoRoute;
