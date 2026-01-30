
import { logger } from "../config/logger.js";
import { ConfigKey, PaymentGateway } from "../types/enums.js";
import { PaymentProvider } from "../types/payment.js";
import { getConfig } from "./configuracao.service.js";
import { C6PaymentProvider } from "./providers/c6.provider.js";
import { InterPaymentProvider } from "./providers/inter.provider.js";
import { MockPaymentProvider } from "./providers/mock.provider.js";

class PaymentService {
  private currentProvider: PaymentProvider | null = null;
  private activeGateway: PaymentGateway | null = null;

  constructor() {
    // Não inicializamos padrão síncrono para garantir que dependa da configuração
  }

  /**
   * Inicializa o gateway ativo buscando do ambiente ou banco de dados.
   * Chamado no startup do servidor.
   */
  async initialize() {
    try {
      // 1. Prioridade: Variável de Ambiente
      let gateway = process.env.ACTIVE_GATEWAY;

      // 2. Se não houver no env, buscar no Banco de Dados
      if (!gateway) {
        gateway = await getConfig(ConfigKey.ACTIVE_GATEWAY, "");
      }

      if (!gateway) {
        logger.error("ERRO CRÍTICO: Nenhum gateway de pagamento configurado (ACTIVE_GATEWAY).");
        return;
      }

      this.activeGateway = gateway.toLowerCase() as PaymentGateway;
      this.resolveProvider(this.activeGateway);
      
      logger.info({ gateway: this.activeGateway }, "PaymentService inicializado com sucesso.");
    } catch (err: any) {
      logger.error({ err: err.message }, "Falha ao inicializar PaymentService.");
    }
  }

  /**
   * Resolve a instância concreta do provider baseado no slug
   */
  private resolveProvider(gateway: PaymentGateway) {
    switch (gateway) {
      case PaymentGateway.INTER:
        this.currentProvider = new InterPaymentProvider();
        break;

      case PaymentGateway.C6:
        this.currentProvider = new C6PaymentProvider();
        break;
      
      case PaymentGateway.MOCK:
        logger.info("PaymentService: Modo MOCK ativado.");
        this.currentProvider = new MockPaymentProvider();
        break;

      default:
        throw new Error(`Gateway de pagamento '${gateway}' não é suportado pelo sistema.`);
    }
  }

  /**
   * Retorna o provider ativo. 
   * Lança erro se não estiver inicializado ou configurado.
   */
  getProvider(): PaymentProvider {
    if (!this.currentProvider) {
      throw new Error(`PaymentService não inicializado ou gateway '${this.activeGateway}' inválido/não suportado.`);
    }
    return this.currentProvider;
  }

  /**
   * Enfileira os pagamentos recebidos via Webhook para processamento assíncrono.
   * Centraliza a lógica que antes ficava no Controller.
   */
  async enqueueWebhooks(pixList: any[], gateway: PaymentGateway) {
    const { addToWebhookQueue } = await import("../queues/webhook.queue.js");
    
    for (const pagamento of pixList) {
      try {
        await addToWebhookQueue({
          pagamento,
          origin: gateway
        });
      } catch (err) {
        logger.error({ err, txid: pagamento.txid, gateway }, "Falha ao enfileirar webhook no Service");
        throw err;
      }
    }
  }

  /**
   * Retorna o identificador do gateway ativo
   */
  getActiveGateway(): PaymentGateway {
    if (!this.activeGateway) {
      throw new Error("PaymentService não inicializado.");
    }
    return this.activeGateway;
  }

  isMock(): boolean {
    return this.activeGateway === PaymentGateway.MOCK;
  }
}

export const paymentService = new PaymentService();
