
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { ConfigKey, PaymentGateway } from "../types/enums.js";
import { PaymentProvider } from "../types/payment.js";
import { getConfig } from "./configuracao.service.js";
import { InterPaymentProvider } from "./providers/inter.provider.js";

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
        this.currentProvider = new InterPaymentProvider(supabaseAdmin);
        break;
      
      // Novos providers (C6, Stripe, etc) serão registrados aqui conforme implementados
        
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
   * Retorna o identificador do gateway ativo
   */
  getActiveGateway(): PaymentGateway {
    if (!this.activeGateway) {
      throw new Error("PaymentService não inicializado.");
    }
    return this.activeGateway;
  }
}

export const paymentService = new PaymentService();
