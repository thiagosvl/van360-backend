
import { PaymentGateway } from "../../types/enums.js";
import {
    PaymentCobrancaComVencimentoParams,
    PaymentCobrancaParams,
    PaymentPagamentoParams,
    PaymentProvider,
    PaymentResponse,
    TransferResponse
} from "../../types/payment.js";
import { c6Service } from "../c6.service.js";
import { feeService } from "../fee.service.js";

export class C6PaymentProvider implements PaymentProvider {
  name = PaymentGateway.C6;

  constructor() {}

  async criarCobrancaImediata(params: PaymentCobrancaParams): Promise<PaymentResponse> {
    const response = await c6Service.criarCobrancaImediata(
        params.cobrancaId, 
        params.valor,
        {
            cpf: params.cpf,
            nome: params.nome
        }
    );
    return {
      qrCodePayload: response.pixCopiaECola,
      location: response.location,
      gatewayTransactionId: response.interTransactionId || response.txid // Fallback
    };
  }

  async criarCobrancaComVencimento(params: PaymentCobrancaComVencimentoParams): Promise<PaymentResponse> {
    const response = await c6Service.criarCobrancaVencimento(
        params.cobrancaId, 
        params.valor, 
        params.dataVencimento,
        {
            cpf: params.cpf,
            nome: params.nome
        }
    );
    return {
      qrCodePayload: response.pixCopiaECola,
      location: response.location,
      gatewayTransactionId: response.interTransactionId || response.txid
    };
  }

  async cancelarCobranca(txid: string, tipo: 'cob' | 'cobv'): Promise<boolean> {
    return c6Service.cancelarCobranca(txid);
  }

  async consultarCobranca(txid: string): Promise<any> {
    return c6Service.consultarPix(txid);
  }

  async realizarTransferencia(params: PaymentPagamentoParams): Promise<TransferResponse> {
    const isValidation = (params.valor === 0.01 && params.descricao?.toLowerCase().includes("validacao"));

    if (isValidation) {
      const data = await c6Service.validarChavePix(params.chaveDestino);
      return {
        endToEndId: 'VALIDATION-C6',
        status: 'CONCLUIDA',
        nomeBeneficiario: data.nome,
        cpfCnpjBeneficiario: data.cpfCnpj
      };
    }

    const response = await c6Service.realizarPagamentoPix(params);
    return {
      endToEndId: response.endToEndId,
      status: response.status,
      nomeBeneficiario: response.nomeBeneficiario,
      cpfCnpjBeneficiario: response.cpfCnpjBeneficiario
    };
  }

  async consultarTransferencia(codigoSolicitacao: string): Promise<any> {
    return c6Service.consultarPagamentoPix(codigoSolicitacao);
  }

  async getFee(valor: number, tipo: 'imediato' | 'vencimento'): Promise<number> {
    return feeService.calcularTaxaC6(valor, tipo);
  }

  async registrarWebhook(url: string): Promise<any> {
    return c6Service.configurarWebhook(url);
  }

  async listarPixRecebidos(inicio: string, fim: string): Promise<any[]> {
    return c6Service.listarPixRecebidos(inicio, fim);
  }
}
