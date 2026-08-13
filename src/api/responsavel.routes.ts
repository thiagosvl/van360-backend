import { FastifyInstance } from "fastify";
import { responsavelController } from "../controllers/responsavel.controller.js";

export async function responsavelPublicRoutes(app: FastifyInstance) {
  app.post("/check-phone", responsavelController.checkPhone);
  app.post("/setup-pin", responsavelController.setupPin);
  app.post("/login", responsavelController.login);
  app.get("/passageiros", responsavelController.getPassageiros);
  app.get("/passageiro/:id", responsavelController.getPassageiroCarteirinha);
  app.put("/passageiro/:id/dados-complementares", responsavelController.updateDadosComplementares);
  app.post("/forgot-pin/check-emails", responsavelController.checkResetEmails);
  app.post("/forgot-pin/send-otp", responsavelController.sendResetOtp);
  app.post("/forgot-pin/validate-otp", responsavelController.validateResetOtp);
  app.post("/forgot-pin/execute-reset", responsavelController.executePinReset);
}
