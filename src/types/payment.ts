
export interface PaymentCobrancaParams {
  cobrancaId: string;
  valor: number;
  cpf: string;
  nome: string;
}

export interface PaymentCobrancaComVencimentoParams extends PaymentCobrancaParams {
  dataVencimento: string; // YYYY-MM-DD
  validadeAposVencimentoDias?: number;
}

export interface PaymentPagamentoParams {
  valor: number;
  chaveDestino: string;
  descricao?: string;
  xIdIdempotente: string;
}

export interface PaymentResponse {
  qrCodePayload: string;
  location: string;
  gatewayTransactionId: string;
}

export interface TransferResponse {
  endToEndId: string;
  status: string;
  nomeBeneficiario?: string;
  cpfCnpjBeneficiario?: string;
}

export interface PaymentProvider {
  name: string;
  
  criarCobrancaImediata(params: PaymentCobrancaParams): Promise<PaymentResponse>;
  
  criarCobrancaComVencimento(params: PaymentCobrancaComVencimentoParams): Promise<PaymentResponse>;
  
  cancelarCobranca(txid: string, tipo: 'cob' | 'cobv'): Promise<boolean>;
  
  consultarCobranca(txid: string): Promise<any>;
  
  // Banking / Transfers (Outbound)
  realizarTransferencia(params: PaymentPagamentoParams): Promise<TransferResponse>;
  
  consultarTransferencia(codigoSolicitacao: string): Promise<any>;

  getFee(valor: number, tipo: 'imediato' | 'vencimento'): Promise<number>;
  
  listarPixRecebidos(inicio: string, fim: string): Promise<any[]>;

  registrarWebhook(url: string): Promise<any>;

  validarChavePix(chave: string, idempotencia?: string): Promise<{ valido: boolean; nome?: string; cpfCnpj?: string; erro?: string; idempotenciaUsed?: string }>;
}
