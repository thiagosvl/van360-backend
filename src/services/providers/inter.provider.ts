
import { PaymentGateway } from "../../types/enums.js";
import {
  PaymentCobrancaComVencimentoParams,
  PaymentCobrancaParams,
  PaymentPagamentoParams,
  PaymentProvider,
  PaymentResponse,
  TransferResponse
} from "../../types/payment.js";
import { feeService } from "../fee.service.js";
import { interService } from "../inter.service.js";

export class InterPaymentProvider implements PaymentProvider {
  name = PaymentGateway.INTER;

  constructor() {}

  async criarCobrancaImediata(params: PaymentCobrancaParams): Promise<PaymentResponse> {
    const response = await interService.criarCobrancaPix(params);
    return {
      qrCodePayload: response.qrCodePayload,
      location: response.location,
      gatewayTransactionId: response.interTransactionId
    };
  }

  async criarCobrancaComVencimento(params: PaymentCobrancaComVencimentoParams): Promise<PaymentResponse> {
    const response = await interService.criarCobrancaComVencimentoPix(params);
    return {
      qrCodePayload: response.qrCodePayload,
      location: response.location,
      gatewayTransactionId: response.interTransactionId
    };
  }

  async cancelarCobranca(txid: string, tipo: 'cob' | 'cobv'): Promise<boolean> {
    return interService.cancelarCobrancaPix(txid, tipo);
  }

  async consultarCobranca(txid: string): Promise<any> {
    return interService.consultarPix(txid);
  }

  async realizarTransferencia(params: PaymentPagamentoParams): Promise<TransferResponse> {
    const response = await interService.realizarPagamentoPix(params);
    return {
      endToEndId: response.endToEndId,
      status: response.status,
      nomeBeneficiario: response.nomeBeneficiario,
      cpfCnpjBeneficiario: response.cpfCnpjBeneficiario
    };
  }

  async consultarTransferencia(codigoSolicitacao: string): Promise<any> {
    return interService.consultarPagamentoPix(codigoSolicitacao);
  }

  async getFee(valor: number, tipo: 'imediato' | 'vencimento'): Promise<number> {
    return feeService.calcularTaxaInter(valor, tipo);
  }

  async listarPixRecebidos(inicio: string, fim: string): Promise<any[]> {
    return interService.listarPixRecebidos(inicio, fim);
  }

  async registrarWebhook(url: string): Promise<any> {
    return interService.registrarWebhookPix(url);
  }
}
