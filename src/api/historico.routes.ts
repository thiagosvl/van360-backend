import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { historicoController } from "../controllers/historico.controller.js";

const historicoRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
    // Buscar histórico de uma entidade específica (ex: uma cobrança, um passageiro)
    app.get("/entidade/:entidadeTipo/:entidadeId", historicoController.listByEntidade);
    
    // Buscar histórico geral de um usuário motorista
    app.get("/usuario/:usuarioId", historicoController.listByUsuario);
};

export default historicoRoute;
