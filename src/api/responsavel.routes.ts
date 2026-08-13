import { FastifyInstance } from "fastify";
import { responsavelController } from "../controllers/responsavel.controller.js";

export async function responsavelPublicRoutes(app: FastifyInstance) {
  app.post("/check-phone", responsavelController.checkPhone);
  app.post("/setup-pin", responsavelController.setupPin);
  app.post("/login", responsavelController.login);
  app.get("/passageiro/:id", responsavelController.getPassageiroCarteirinha);
}
