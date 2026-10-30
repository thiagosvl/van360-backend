import { cobrancaRepasseRepository } from "../repositories/cobranca-repasse.repository.js";
import { cobrancaRepository } from "../repositories/cobranca.repository.js";
import { motoristaFinanceiroRepository } from "../repositories/motorista-financeiro.repository.js";
import { paymentService } from "./payments/payment.service.js";
import { PaymentProvider, ProvedorPagamentoEnum, StatusRepasseEnum } from "../types/enums.js";
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

  async cancelarPixCobrancaSeExistir(
    cobrancaId: string,
    provedorCobrancaId?: string | null,
    provedor?: PaymentProvider | ProvedorPagamentoEnum | string | null,
    options?: Record<string, unknown>
  ): Promise<void> {
    let resolvedProvedor = provedor;
    let resolvedProvedorId = provedorCobrancaId;
    let usuarioId: string | null = null;
    let nossoNumero: string | null = null;

    if (!resolvedProvedor || !resolvedProvedorId) {
      const { data: cobranca } = await cobrancaRepository.getById(cobrancaId);
      if (cobranca) {
        resolvedProvedor = resolvedProvedor || cobranca.provedor;
        resolvedProvedorId = resolvedProvedorId || cobranca.provedor_cobranca_id;
        usuarioId = cobranca.usuario_id;
        nossoNumero = cobranca.boleto_nosso_numero;
      }
    }

    if (resolvedProvedorId) {
      try {
        const isBancoDoBrasil =
          resolvedProvedor === PaymentProvider.BANCO_DO_BRASIL ||
          resolvedProvedor === ProvedorPagamentoEnum.BANCO_DO_BRASIL;

        if (isBancoDoBrasil) {
          let numeroConvenio: number | undefined;
          if (usuarioId) {
            const configFin = await motoristaFinanceiroRepository.getByUsuarioId(usuarioId);
            const provConfig = configFin?.provedor_config as Record<string, unknown> | null;
            if (provConfig?.convenio) {
              numeroConvenio = Number(provConfig.convenio);
            }
          }
          await paymentService.cancelCharge(resolvedProvedorId, PaymentProvider.BANCO_DO_BRASIL, {
            numeroConvenio,
            nossoNumero,
            ...options
          });
        } else {
          await paymentService.cancelCharge(resolvedProvedorId, PaymentProvider.WOOVI, options);
        }
      } catch (err: unknown) {
        logger.warn({ error: err, cobrancaId, provedorCobrancaId: resolvedProvedorId }, "[CobrancaValidacaoService] Falha ao cancelar cobrança no provedor");
      }
    }

    await cobrancaRepository.limparDadosPix(cobrancaId);
  }
};
