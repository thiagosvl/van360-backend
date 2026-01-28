
import { SupabaseClient } from "@supabase/supabase-js";
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
  private adminClient: SupabaseClient;

  constructor(adminClient: SupabaseClient) {
    this.adminClient = adminClient;
  }

  async criarCobrancaImediata(params: PaymentCobrancaParams): Promise<PaymentResponse> {
    const response = await interService.criarCobrancaPix(this.adminClient, params);
    return {
      qrCodePayload: response.qrCodePayload,
      location: response.location,
      gatewayTransactionId: response.interTransactionId
    };
  }

  async criarCobrancaComVencimento(params: PaymentCobrancaComVencimentoParams): Promise<PaymentResponse> {
    const response = await interService.criarCobrancaComVencimentoPix(this.adminClient, params);
    return {
      qrCodePayload: response.qrCodePayload,
      location: response.location,
      gatewayTransactionId: response.interTransactionId
    };
  }

  async cancelarCobranca(txid: string, tipo: 'cob' | 'cobv'): Promise<boolean> {
    return interService.cancelarCobrancaPix(this.adminClient, txid, tipo);
  }

  async consultarCobranca(txid: string): Promise<any> {
    return interService.consultarPix(this.adminClient, txid);
  }

  async realizarTransferencia(params: PaymentPagamentoParams): Promise<TransferResponse> {
    const response = await interService.realizarPagamentoPix(this.adminClient, params);
    return {
      endToEndId: response.endToEndId,
      status: response.status,
      nomeBeneficiario: response.nomeBeneficiario,
      cpfCnpjBeneficiario: response.cpfCnpjBeneficiario
    };
  }

  async consultarTransferencia(codigoSolicitacao: string): Promise<any> {
    return interService.consultarPagamentoPix(this.adminClient, codigoSolicitacao);
  }

  async getFee(valor: number, tipo: 'imediato' | 'vencimento'): Promise<number> {
    return feeService.calcularTaxaInter(valor, tipo);
  }

  async listarPixRecebidos(inicio: string, fim: string): Promise<any[]> {
    return interService.listarPixRecebidos(this.adminClient, inicio, fim);
  }
}
