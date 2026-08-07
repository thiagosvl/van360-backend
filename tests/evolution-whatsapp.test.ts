import { describe, it, expect } from "vitest";
import { PassengerTemplates, PassengerContext } from "../src/services/notifications/templates/passenger.template.js";
import { RouteTemplates, RouteContext } from "../src/services/notifications/templates/route.template.js";
import { formatEvolutionNumber } from "../src/utils/string.utils.js";
import { EvolutionMediaType, EvolutionEvent, EvolutionIntegration } from "../src/types/enums.js";

describe("Suíte de Testes - Evolution Instancias e Templates de Mensagens", () => {
  describe("1. Formatação de Número para Evolution API", () => {
    it("Deve formatar o número do telefone acrescentando o código de país 55 quando necessário", () => {
      expect(formatEvolutionNumber("11999998888")).toBe("5511999998888");
      expect(formatEvolutionNumber("5511999998888")).toBe("5511999998888");
      expect(formatEvolutionNumber("(11) 99999-8888")).toBe("5511999998888");
      expect(formatEvolutionNumber("+55 11 99999-8888")).toBe("5511999998888");
    });
  });

  describe("2. Templates de Cobrança (PassengerTemplates)", () => {
    const baseContext: PassengerContext = {
      nomeResponsavel: "Maria Oliveira",
      nomePassageiro: "Lucas Oliveira",
      nomeMotorista: "Carlos Transportes",
      usuarioId: "user-uuid-123",
      mes: 8,
      ano: 2026,
      valor: 380,
      dataVencimento: "2026-08-10"
    };

    it("Deve montar template de aviso prévio de vencimento (dueSoon) sem chave Pix", () => {
      const parts = PassengerTemplates.dueSoon({ ...baseContext, diasAntecedencia: 2 });
      expect(parts).toHaveLength(1);
      expect(parts[0].type).toBe("text");
      expect(parts[0].content).toContain("Lucas");
      expect(parts[0].content).toContain("daqui a 2 dias");
      expect(parts[0].content).toContain("Carlos");
    });

    it("Deve montar template de vencimento em partes compostas com chave Pix quando informada", () => {
      const parts = PassengerTemplates.dueSoon({
        ...baseContext,
        chavePix: "12345678900",
        tipoChavePix: "CPF"
      });

      expect(parts).toHaveLength(3);
      expect(parts[0].type).toBe("text");
      expect(parts[0].content).toContain("Segue a chave Pix para pagamento:");
      expect(parts[1].content).toBe("123.456.789-00");
      expect(parts[2].content).toContain("Copie a chave Pix (CPF) acima");
    });

    it("Deve montar template de cobrança vencendo hoje (dueToday)", () => {
      const parts = PassengerTemplates.dueToday(baseContext);
      expect(parts[0].content).toContain("vence hoje");
      expect(parts[0].content).toContain("Maria");
    });

    it("Deve montar template de cobrança em atraso (overdue)", () => {
      const parts = PassengerTemplates.overdue({ ...baseContext, diasAtraso: 5 });
      expect(parts[0].content).toContain("em atraso");
      expect(parts[0].content).toContain("há 5 dias");
    });
  });

  describe("3. Templates de Recibo de Pagamento (PassengerTemplates)", () => {
    const receiptContext: PassengerContext = {
      nomeResponsavel: "Ana Souza",
      nomePassageiro: "Pedro Souza",
      nomeMotorista: "João da Van",
      usuarioId: "user-uuid-456",
      mes: 8,
      ano: 2026,
      valor: 400
    };

    it("Deve montar mensagem de recibo simples em formato texto quando não há URL de imagem", () => {
      const parts = PassengerTemplates.paymentReceipt(receiptContext);
      expect(parts).toHaveLength(1);
      expect(parts[0].type).toBe("text");
      expect(parts[0].content).toContain("Comprovante de Pagamento");
      expect(parts[0].content).toContain("Pedro");
    });

    it("Deve montar mensagem de recibo com mídia de imagem quando reciboUrl for fornecido", () => {
      const parts = PassengerTemplates.paymentReceipt({
        ...receiptContext,
        reciboUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
      });

      expect(parts).toHaveLength(1);
      expect(parts[0].type).toBe("image");
      expect(parts[0].mediaBase64).toContain("data:image/png;base64");
      expect(parts[0].content).toContain("Comprovante de Pagamento");
    });
  });

  describe("4. Templates de Aviso de Rota (RouteTemplates)", () => {
    const routeContext: RouteContext = {
      nomeResponsavel: "Fernanda Costa",
      nomePassageiro: "Gabriel Costa",
      nomeMotorista: "Roberto Alves",
      apelidoMotorista: "Tio Beto",
      telefoneMotorista: "11988887777"
    };

    it("Deve montar template 'Van a Caminho' (enRouteIda)", () => {
      const parts = RouteTemplates.enRouteIda(routeContext);
      expect(parts[0].content).toContain("Van a Caminho!");
      expect(parts[0].content).toContain("Gabriel Costa");
      expect(parts[0].content).toContain("Tio Beto");
      expect(parts[0].content).toContain("wa.me/5511988887777");
    });

    it("Deve montar template 'Embarque Confirmado' (boardedIda)", () => {
      const parts = RouteTemplates.boardedIda(routeContext);
      expect(parts[0].content).toContain("Embarque Confirmado");
      expect(parts[0].content).toContain("a caminho da escola");
    });

    it("Deve montar template 'Passageiro Chegando' (enRouteVolta)", () => {
      const parts = RouteTemplates.enRouteVolta(routeContext);
      expect(parts[0].content).toContain("Passageiro Chegando!");
      expect(parts[0].content).toContain("Gabriel Costa");
    });

    it("Deve montar template 'Entrega Confirmada' (deliveredVolta)", () => {
      const parts = RouteTemplates.deliveredVolta(routeContext);
      expect(parts[0].content).toContain("Entrega Confirmada");
      expect(parts[0].content).toContain("entregue em segurança");
    });
  });

  describe("5. Estrutura de Payloads da Evolution API v2", () => {
    it("Deve gerar payload correto para envio de mensagem de texto (sendText)", () => {
      const number = "11999998888";
      const text = "Olá, tudo bem?";
      const formattedNumber = formatEvolutionNumber(number);

      const payload = {
        number: formattedNumber,
        text,
        delay: 1200,
        linkPreview: true
      };

      expect(payload).toEqual({
        number: "5511999998888",
        text: "Olá, tudo bem?",
        delay: 1200,
        linkPreview: true
      });
    });

    it("Deve gerar payload correto para envio de imagem/mídia (sendMedia)", () => {
      const number = "11999998888";
      const mediaBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA";
      const cleanBase64 = mediaBase64.includes("base64,") ? mediaBase64.split("base64,")[1] : mediaBase64;
      const caption = "Comprovante enviado";

      const payload = {
        number: formatEvolutionNumber(number),
        media: cleanBase64,
        mediatype: EvolutionMediaType.IMAGE,
        caption
      };

      expect(payload.number).toBe("5511999998888");
      expect(payload.mediatype).toBe("image");
      expect(payload.media).not.toContain("data:image/png;base64,");
      expect(payload.caption).toBe("Comprovante enviado");
    });

    it("Deve estruturar a configuração de webhook da Evolution API", () => {
      const webhookUrl = "https://backend.van360.com.br/api/evolution/webhook";
      const webhookPayload = {
        webhook: {
          url: webhookUrl,
          enabled: true,
          byEvents: false,
          base64: true,
          events: [
            EvolutionEvent._CONNECTION_UPDATE,
            EvolutionEvent._MESSAGES_UPSERT,
            EvolutionEvent._MESSAGES_UPDATE,
            EvolutionEvent._QRCODE_UPDATED
          ]
        }
      };

      expect(webhookPayload.webhook.enabled).toBe(true);
      expect(webhookPayload.webhook.events).toHaveLength(4);
      expect(webhookPayload.webhook.events).toContain(EvolutionEvent._CONNECTION_UPDATE);
    });

    it("Deve criar payload de inicialização de instância", () => {
      const instancePayload = {
        instanceName: "van360_user_123",
        token: "secret_evo_key",
        qrcode: true,
        integration: EvolutionIntegration.BAILEYS
      };

      expect(instancePayload.instanceName).toBe("van360_user_123");
      expect(instancePayload.integration).toBe("WHATSAPP-BAILEYS");
    });
  });
});
