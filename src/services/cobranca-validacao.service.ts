import { cobrancaRepasseRepository } from "../repositories/cobranca-repasse.repository.js";
import { cobrancaRepository } from "../repositories/cobranca.repository.js";
import { paymentService } from "./payments/payment.service.js";
import { PaymentProvider, StatusRepasseEnum } from "../types/enums.js";
import { AppError } from "../errors/AppError.js";
import { logger } from "../config/logger.js";

export const cobrancaValidacaoService = {
  async validarImpedimentoPorRepasse(
    cobrancaId: string,
    cobranca: { repasse_em_processamento?: boolean | null } | null | undefined,
    acao: string
  ): Promise<void> {
    if (cobranca?.repasse_em_processamento) {
      throw new AppError(`Não é possível ${acao}: esta cobrança está com repasse automático em processamento via Pix.`, 400);
    }

    const repasse = await cobrancaRepasseRepository.getByCobrancaId(cobrancaId);
    if (repasse && (repasse.status_repasse === StatusRepasseEnum.SUCESSO || repasse.status_repasse === StatusRepasseEnum.PROCESSANDO)) {
      throw new AppError(`Não é possível ${acao}: esta cobrança possui repasse automático liquidado ou em processamento.`, 400);
    }
  },

  async cancelarPixCobrancaSeExistir(cobrancaId: string, provedorCobrancaId?: string | null): Promise<void> {
    if (provedorCobrancaId) {
      try {
        await paymentService.cancelCharge(provedorCobrancaId, PaymentProvider.WOOVI);
      } catch (err: unknown) {
        logger.warn({ error: err, cobrancaId, provedorCobrancaId }, "[CobrancaValidacaoService] Falha ao cancelar cobrança Pix no provedor");
      }
    }
    await cobrancaRepository.limparDadosPix(cobrancaId);
  }
};
