import { cobrancaService } from "../cobranca.service.js";

export const cobrancasNotificacoesJob = {
  async runDaily() {
    return cobrancaService.enviarNotificacoesDiarias();
  }
};
