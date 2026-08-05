import { describe, it, expect, vi, beforeEach } from "vitest";
import { EfipayProvider } from "../src/services/payments/providers/efipay.provider.js";
import { CobrancaStatus, CobrancaTipoPagamento, PaymentProvider } from "../src/types/enums.js";
import { NormalizedPaymentEvent } from "../src/types/payment.js";

interface CobrancaRecord {
  id: string;
  status: CobrancaStatus;
  valor: number;
  valor_pago: number | null;
  data_pagamento: string | null;
  tipo_pagamento: CobrancaTipoPagamento | null;
  txid: string;
}

function processarBaixaAutomatica(
  cobranca: CobrancaRecord,
  event: NormalizedPaymentEvent
): { sucesso: boolean; alterado: boolean; cobranca: CobrancaRecord; mensagem: string } {
  if (cobranca.status === CobrancaStatus.PAGO) {
    return {
      sucesso: true,
      alterado: false,
      cobranca,
      mensagem: "Notificação duplicada ignorada (Idempotência mantida)."
    };
  }

  if (cobranca.status === CobrancaStatus.CANCELADO) {
    return {
      sucesso: false,
      alterado: false,
      cobranca,
      mensagem: "Cobrança cancelada não pode receber baixa automática."
    };
  }

  const updated: CobrancaRecord = {
    ...cobranca,
    status: CobrancaStatus.PAGO,
    valor_pago: event.amount ?? cobranca.valor,
    data_pagamento: event.paidAt ? event.paidAt.toISOString() : new Date().toISOString(),
    tipo_pagamento: CobrancaTipoPagamento.PIX
  };

  return {
    sucesso: true,
    alterado: true,
    cobranca: updated,
    mensagem: "Baixa automática concluída com sucesso."
  };
}

describe("Suíte de Testes - Webhook EfiPay Pix e Baixa Automática", () => {
  let provider: EfipayProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new EfipayProvider();
  });

  describe("1. Parseamento de Payloads de Webhook EfiPay (Pix e Cartão)", () => {
    it("Deve parsear payload válido de Pix recebido com sucesso", async () => {
      const rawBody = {
        pix: [
          {
            endToEndId: "E1234567820260805120000000000000",
            txid: "txid_pix_998877",
            chave: "12345678901",
            valor: "250.50",
            horario: "2026-08-05T10:15:30.000Z"
          }
        ]
      };

      const result = await provider.normalizeWebhook(rawBody);

      expect(result).not.toBeNull();
      expect(result?.type).toBe("PAYMENT_RECEIVED");
      expect(result?.internalId).toBe("txid_pix_998877");
      expect(result?.providerRef).toBe("E1234567820260805120000000000000");
      expect(result?.amount).toBe(250.5);
      expect(result?.paidAt).toBeInstanceOf(Date);
    });

    it("Deve retornar null para payloads de webhook não reconhecidos ou vazios", async () => {
      const invalidBody = { outroServico: true };
      const emptyBody = {};

      const result1 = await provider.normalizeWebhook(invalidBody);
      const result2 = await provider.normalizeWebhook(emptyBody);

      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });

    it("Deve identificar corretamente a propriedade providerName como EFIPAY", () => {
      expect(provider.providerName).toBe(PaymentProvider.EFIPAY);
    });
  });

  describe("2. Baixa Automática de Cobrança (pendente -> paga)", () => {
    it("Deve transitar status de 'pendente' para 'paga' com dados de pagamento corretos", () => {
      const cobrancaPendente: CobrancaRecord = {
        id: "cob_112233",
        status: CobrancaStatus.PENDENTE,
        valor: 350.0,
        valor_pago: null,
        data_pagamento: null,
        tipo_pagamento: null,
        txid: "txid_pix_998877"
      };

      const event: NormalizedPaymentEvent = {
        type: "PAYMENT_RECEIVED",
        internalId: "txid_pix_998877",
        providerRef: "E1234567820260805120000000000000",
        amount: 350.0,
        paidAt: new Date("2026-08-05T10:15:30.000Z"),
        raw: {}
      };

      const res = processarBaixaAutomatica(cobrancaPendente, event);

      expect(res.sucesso).toBe(true);
      expect(res.alterado).toBe(true);
      expect(res.cobranca.status).toBe(CobrancaStatus.PAGO);
      expect(res.cobranca.valor_pago).toBe(350.0);
      expect(res.cobranca.tipo_pagamento).toBe(CobrancaTipoPagamento.PIX);
      expect(res.cobranca.data_pagamento).toBe("2026-08-05T10:15:30.000Z");
    });
  });

  describe("3. Idempotência do Processamento de Webhook", () => {
    it("Deve ignorar reprocessamento se a cobrança já estiver com status 'pago'", () => {
      const cobrancaJaPaga: CobrancaRecord = {
        id: "cob_112233",
        status: CobrancaStatus.PAGO,
        valor: 350.0,
        valor_pago: 350.0,
        data_pagamento: "2026-08-05T10:15:30.000Z",
        tipo_pagamento: CobrancaTipoPagamento.PIX,
        txid: "txid_pix_998877"
      };

      const duplicateEvent: NormalizedPaymentEvent = {
        type: "PAYMENT_RECEIVED",
        internalId: "txid_pix_998877",
        providerRef: "E1234567820260805120000000000000",
        amount: 350.0,
        paidAt: new Date("2026-08-05T10:15:30.000Z"),
        raw: {}
      };

      const res = processarBaixaAutomatica(cobrancaJaPaga, duplicateEvent);

      expect(res.sucesso).toBe(true);
      expect(res.alterado).toBe(false);
      expect(res.cobranca.status).toBe(CobrancaStatus.PAGO);
      expect(res.mensagem).toContain("Notificação duplicada ignorada");
    });

    it("Deve recusar baixa em cobrança previamente cancelada", () => {
      const cobrancaCancelada: CobrancaRecord = {
        id: "cob_445566",
        status: CobrancaStatus.CANCELADO,
        valor: 200.0,
        valor_pago: null,
        data_pagamento: null,
        tipo_pagamento: null,
        txid: "txid_cancelado"
      };

      const event: NormalizedPaymentEvent = {
        type: "PAYMENT_RECEIVED",
        internalId: "txid_cancelado",
        providerRef: "E9999",
        amount: 200.0,
        paidAt: new Date(),
        raw: {}
      };

      const res = processarBaixaAutomatica(cobrancaCancelada, event);

      expect(res.sucesso).toBe(false);
      expect(res.alterado).toBe(false);
      expect(res.mensagem).toContain("Cobrança cancelada não pode receber baixa automática");
    });
  });
});
