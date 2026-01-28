export interface StandardPaymentPayload {
  gatewayTransactionId: string; // O txid original do provedor
  endToEndId?: string;          // ID único do PIX (se disponível)
  amount: number;               // Valor pago
  paymentDate: string;          // ISO Date string do pagamento
  rawPayload: any;             // O payload original completo para log/auditoria
  gateway: string;             // Nome do gateway
}

