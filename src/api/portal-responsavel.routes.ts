import { FastifyInstance } from "fastify";
import { portalResponsavelController } from "../controllers/portal-responsavel.controller.js";

export async function portalResponsavelPublicRoutes(app: FastifyInstance) {
  app.post("/check-phone", portalResponsavelController.checkPhone);
  app.post("/setup-pin", portalResponsavelController.setupPin);
  app.post("/login", portalResponsavelController.login);
  app.get("/passageiros", portalResponsavelController.getPassageiros);
  app.get("/passageiro/:id", portalResponsavelController.getPassageiroCarteirinha);
  app.get("/passageiro/:id/rastreamento", portalResponsavelController.getRastreamentoPassageiro);
  app.put("/passageiro/:id/dados-complementares", portalResponsavelController.updateDadosComplementares);
  app.put("/passageiro/:id/observacoes", portalResponsavelController.updateObservacoes);
  app.post("/passageiro/:id/responsaveis", portalResponsavelController.addResponsavel);
  app.put("/passageiro/:id/responsaveis/:responsavelId", portalResponsavelController.updateResponsavel);
  app.delete("/passageiro/:id/responsaveis/:responsavelId", portalResponsavelController.deleteResponsavel);
  app.patch("/passageiro/:id/responsaveis/:responsavelId/set-principal", portalResponsavelController.setPrincipalResponsavel);
  app.post("/passageiro/:id/ausencias", portalResponsavelController.registrarAusencia);
  app.delete("/passageiro/:id/ausencias/:ausenciaId", portalResponsavelController.removerAusencia);
  app.post("/forgot-pin/check-emails", portalResponsavelController.checkResetEmails);
  app.post("/forgot-pin/send-otp", portalResponsavelController.sendResetOtp);
  app.post("/forgot-pin/validate-otp", portalResponsavelController.validateResetOtp);
  app.post("/forgot-pin/execute-reset", portalResponsavelController.executePinReset);
  app.post("/push-token", portalResponsavelController.registerPushToken);
}
