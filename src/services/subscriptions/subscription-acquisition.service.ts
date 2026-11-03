import { logger } from "../../config/logger.js";
import { invoiceRepository } from "../../repositories/invoice.repository.js";
import { CheckoutPaymentMethod, SubscriptionInvoiceStatus } from "../../types/enums.js";

export const subscriptionAcquisitionService = {
  async isFirstPaidActivation(
    userId: string,
    opts: {
      currentInvoiceId?: string;
      previousPaymentMethod?: string | null;
    }
  ): Promise<boolean | null> {
    if (opts.previousPaymentMethod === CheckoutPaymentMethod.APPLE_IAP) return false;

    const { data: invoices, error } = await invoiceRepository.getInvoicesByUserId(userId);
    if (error) {
      logger.error({ error, userId }, "[SubscriptionAcquisition] Erro ao consultar faturas do usuário");
      return null;
    }

    const previousPaid = (invoices || []).filter(
      (invoice) => invoice.status === SubscriptionInvoiceStatus.PAID && invoice.id !== opts.currentInvoiceId
    );
    return previousPaid.length === 0;
  },
};
