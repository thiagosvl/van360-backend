import { logger } from "../config/logger.js";
import { getConfigJSON } from "./configuracao.service.js";

/**
 * Tipos de Pix suportados pelo Banco Inter para os quais temos tarifas diferenciadas
 */
export type InterPixType = 'imediato' | 'vencimento';

/**
 * Interface que define a estrutura de tarifas do Banco Inter
 */
interface InterFeeConfig {
  pct: number;
  min: number;
  max: number;
}

/**
 * Regras de tarifação padrão (Janeiro/2026) - Usado como fallback
 */
const DEFAULT_INTER_FEE_RULES: Record<InterPixType, InterFeeConfig> = {
  imediato: { pct: 0.009, min: 0.10, max: 1.50 },
  vencimento: { pct: 0.0099, min: 0.10, max: 1.99 }
};

/**
 * Calcula a taxa real do Banco Inter para uma transação Pix de forma dinâmica.
 */
export async function calcularTaxaInter(valor: number, tipo: InterPixType = 'vencimento'): Promise<number> {
  const rules = await getConfigJSON<Record<InterPixType, InterFeeConfig>>(
    'GATEWAY_INTER_FEES', 
    DEFAULT_INTER_FEE_RULES
  );
  
  const config = rules[tipo] || DEFAULT_INTER_FEE_RULES[tipo];
  
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

  logger.debug({ 
    valor, 
    tipo, 
    pct: config.pct, 
    taxaFinal 
  }, "[feeService.calcularTaxaInter] Cálculo de taxa dinâmico");

  return taxaFinal;
}

export const feeService = {
  calcularTaxaInter
};
