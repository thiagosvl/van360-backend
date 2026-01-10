import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { prePassageiroController } from "../controllers/pre-passageiro.controller.js";

const prePassageiroRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get("/usuario/:usuarioId", prePassageiroController.listByUsuario);
  app.post("/", prePassageiroController.create);
  app.delete("/:id", prePassageiroController.delete);
};

export default prePassageiroRoute;
