import { expurgarCodigosRecuperacaoExpirados } from "../auth.service.js";

export const limpezaTokensJob = {
  async runDaily() {
    return expurgarCodigosRecuperacaoExpirados();
  }
};
