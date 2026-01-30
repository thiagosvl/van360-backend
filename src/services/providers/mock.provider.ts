import { logger } from "../../config/logger.js";
import { PaymentCobrancaComVencimentoParams, PaymentCobrancaParams, PaymentPagamentoParams, PaymentProvider, PaymentResponse, TransferResponse } from "../../types/payment.js";

export class MockPaymentProvider implements PaymentProvider {
  name = "Mock";

  async criarCobrancaImediata(params: PaymentCobrancaParams): Promise<PaymentResponse> {
    logger.info({ params }, "MOCK: Cobrança Imediata criada");
    return {
      qrCodePayload: "00020126580014BR.GOV.BCB.PIX0136123e4567-e89b-12d3-a456-42661417400052040000530398654041.005802BR5913Cicrano de Tal6008Brasilia62070503***63041D3D",
      location: "pix.example.com/qr/v2/mock-uuid",
      gatewayTransactionId: `mock_tx_${Date.now()}`
    };
  }

  async criarCobrancaComVencimento(params: PaymentCobrancaComVencimentoParams): Promise<PaymentResponse> {
    logger.info({ params }, "MOCK: Cobrança com Vencimento criada");
    return {
      qrCodePayload: "00020126580014BR.GOV.BCB.PIX0136123e4567-e89b-12d3-a456-42661417400052040000530398654041.005802BR5913Cicrano de Tal6008Brasilia62070503***63041D3D",
      location: "pix.example.com/qr/v2/mock-uuid-due",
      gatewayTransactionId: `mock_tx_due_${Date.now()}`
    };
  }

  async cancelarCobranca(txid: string, tipo: 'cob' | 'cobv'): Promise<boolean> {
    logger.info({ txid, tipo }, "MOCK: Cobrança cancelada");
    return true;
  }

  async consultarCobranca(txid: string): Promise<any> {
    logger.info({ txid }, "MOCK: Consultando cobrança");
    // Retorna status simulado, por exemplo, ATIVA
    return { status: "ATIVA", txid };
  }

  async realizarTransferencia(params: PaymentPagamentoParams): Promise<TransferResponse> {
    logger.info({ params }, "MOCK: Transferência realizada");
    return {
      endToEndId: `E${Date.now()}MOCK`,
      status: "CONCLUIDA",
      nomeBeneficiario: "Beneficiário Mock",
      cpfCnpjBeneficiario: "***.***.***-**"
    };
  }

  async consultarTransferencia(codigoSolicitacao: string): Promise<any> {
    logger.info({ codigoSolicitacao }, "MOCK: Consultando transferência");
    return { status: "CONCLUIDA" };
  }

  async getFee(valor: number, tipo: 'imediato' | 'vencimento'): Promise<number> {
    return 0; // Mock sem taxas
  }

  async listarPixRecebidos(inicio: string, fim: string): Promise<any[]> {
    logger.info({ inicio, fim }, "MOCK: Listando Pix recebidos (retornando vazio)");
    return [];
  }

  async registrarWebhook(url: string): Promise<any> {
    logger.info({ url }, "MOCK: registrarWebhook chamado");
    return { status: "registered_mock" };
  }

  async validarChavePix(chave: string, idempotencia?: string): Promise<{ valido: boolean; nome?: string; cpfCnpj?: string; erro?: string; idempotenciaUsed?: string }> {
    logger.info({ chave, idempotencia }, "MOCK: validarChavePix chamado - retornando sucesso");
    return { 
      valido: true, 
      nome: "MOCK USER VALIDATION", 
      cpfCnpj: "***.000.000-**",
      idempotenciaUsed: idempotencia
    };
  }
}
