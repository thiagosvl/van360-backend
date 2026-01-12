import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";

import { ConfigKey } from "../types/enums.js";

// Re-exportando para manter compatibilidade ou usando direto


/**
 * Busca uma configuração do banco de dados com fallback para valor padrão
 */
export async function getConfig(key: ConfigKey, defaultValue: string): Promise<string>;
export async function getConfig(key: string, defaultValue: string): Promise<string>;
export async function getConfig(key: string, defaultValue: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("configuracao_interna")
    .select("valor")
    .eq("chave", key)
    .single();

  if (error || !data) {
    logger.warn({ key, defaultValue, error: error?.message }, "Configuração não encontrada, usando valor padrão.");
    return defaultValue;
  }

  return data.valor;
}

/**
 * Busca configuração e converte para Number
 */
export async function getConfigNumber(key: ConfigKey, defaultValue: number): Promise<number> {
  const valor = await getConfig(key, String(defaultValue));
  // Substituir vírgula por ponto para garantir compatibilidade
  const valorFormatado = valor.replace(",", ".");
  const numero = Number(valorFormatado);

  if (isNaN(numero)) {
    logger.error({ key, valor, defaultValue }, "Valor de configuração inválido para número.");
    return defaultValue;
  }

  return numero;
}

/**
 * Helper específico para configurações de Billing
 */
export async function getBillingConfig() {
  const [
    diasProRata,
    valorMinimoProRata,
    incrementoBloco,
    taxaIntermediacaoPix
  ] = await Promise.all([
    getConfigNumber(ConfigKey.PRO_RATA_DIAS_MES, 30),
    getConfigNumber(ConfigKey.PRO_RATA_VALOR_MINIMO, 0.01),
    getConfigNumber(ConfigKey.VALOR_INCREMENTO_PASSAGEIRO_EXCESSO, 2.50),
    getConfigNumber(ConfigKey.TAXA_INTERMEDIACAO_PIX, 0.99),
    getConfigNumber(ConfigKey.DIAS_ANTECEDENCIA_RENOVACAO, 5)
  ]);

  /* Recycled variable for the new logic */
  const valorIncrementoPassageiro = incrementoBloco; 

  return {
    diasProRata,
    valorMinimoProRata,
    planoBaseId: null, 
    valorIncrementoPassageiro,
    taxaIntermediacaoPix,
    diasAntecedenciaRenovacao: (await Promise.all([getConfigNumber(ConfigKey.DIAS_ANTECEDENCIA_RENOVACAO, 5)]))[0] // Fallback safe retrieval if not in array destructuring above (simplificado abaixo)
  };
}
