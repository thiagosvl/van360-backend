import { logger } from "../config/logger.js";
import { PaymentGateway } from "../types/enums.js";
import { getConfigJSON } from "./configuracao.service.js";

/**
 * Tipos de Pix suportados para os quais temos tarifas diferenciadas
 */
export type PixType = 'imediato' | 'vencimento';

/**
 * Interface que define a estrutura de tarifas genérica
 */
interface FeeConfig {
  pct: number;   // Percentual (ex: 0.009 = 0.9%)
  min: number;   // Taxa mínima em R$
  max: number;   // Taxa máxima (teto) em R$
}

/**
 * Regras de tarifação padrão por Gateway
 */
const DEFAULT_FEE_RULES: Record<PaymentGateway, Record<PixType, FeeConfig>> = {
  [PaymentGateway.INTER]: {
    imediato: { pct: 0.009, min: 0.10, max: 1.50 },
    vencimento: { pct: 0.0099, min: 0.10, max: 1.99 }
  },
  [PaymentGateway.C6]: {
    // C6 Taxa Zero (Janeiro/2026) - Pode ser alterado via banco de dados
    imediato: { pct: 0, min: 0, max: 0 },
    vencimento: { pct: 0, min: 0, max: 0 }
  }
};

/**
 * Calcula a taxa de um gateway para uma transação Pix de forma dinâmica.
 * Busca regras no banco de dados (GATEWAY_{GATEWAY}_FEES) ou usa fallback.
 */
export async function calcularTaxa(
  gateway: PaymentGateway, 
  valor: number, 
  tipo: PixType = 'vencimento'
): Promise<number> {
  const configKey = `GATEWAY_${gateway.toUpperCase()}_FEES`;
  const defaultRules = DEFAULT_FEE_RULES[gateway] || { imediato: { pct: 0, min: 0, max: 0 }, vencimento: { pct: 0, min: 0, max: 0 } };
  
  const rules = await getConfigJSON<Record<PixType, FeeConfig>>(configKey, defaultRules);
  const config = rules[tipo] || defaultRules[tipo];
  
  // Se taxa é zero (C6 promoção), retorna imediatamente
  if (config.pct === 0 && config.min === 0 && config.max === 0) {
    return 0;
  }
  
  // Cálculo base percentual
  let taxa = valor * config.pct;
  
  // Aplicação de Mínimo e Máximo (Teto)
  if (taxa < config.min) {
    taxa = config.min;
  } else if (taxa > config.max) {
    taxa = config.max;
  }
  
  // Arredondamento para centavos
  const taxaFinal = Math.round(taxa * 100) / 100;

  logger.debug({ gateway, valor, tipo, pct: config.pct, taxaFinal }, "[feeService.calcularTaxa]");

  return taxaFinal;
}

/**
 * @deprecated Use calcularTaxa(PaymentGateway.INTER, valor, tipo) 
 * Mantido para retrocompatibilidade
 */
export async function calcularTaxaInter(valor: number, tipo: PixType = 'vencimento'): Promise<number> {
  return calcularTaxa(PaymentGateway.INTER, valor, tipo);
}

/**
 * Calcula taxa C6 (wrapper para legibilidade)
 */
export async function calcularTaxaC6(valor: number, tipo: PixType = 'vencimento'): Promise<number> {
  return calcularTaxa(PaymentGateway.C6, valor, tipo);
}

export const feeService = {
  calcularTaxa,
  calcularTaxaInter,
  calcularTaxaC6
};

