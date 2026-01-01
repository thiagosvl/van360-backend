import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";

export const CONFIG_KEYS = {
  PRO_RATA_DIAS_MES: "PRO_RATA_DIAS_MES",
  PRO_RATA_VALOR_MINIMO: "PRO_RATA_VALOR_MINIMO",
  ENTERPRISE_PLANO_BASE_ID: "ENTERPRISE_PLANO_BASE_ID",
  ENTERPRISE_INCREMENTO_BLOCO: "ENTERPRISE_INCREMENTO_BLOCO",
  ENTERPRISE_TAMANHO_BLOCO: "ENTERPRISE_TAMANHO_BLOCO",
} as const;

export type ConfigKey = keyof typeof CONFIG_KEYS;

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
    tamanhoBloco
  ] = await Promise.all([
    getConfigNumber("PRO_RATA_DIAS_MES", 30),
    getConfigNumber("PRO_RATA_VALOR_MINIMO", 0.01),
    getConfigNumber("ENTERPRISE_INCREMENTO_BLOCO", 70.00),
    getConfigNumber("ENTERPRISE_TAMANHO_BLOCO", 30)
  ]);

  return {
    diasProRata,
    valorMinimoProRata,
    planoBaseId: null, // Legacy: Removido em favor de discovery dinâmico
    incrementoBloco,
    tamanhoBloco
  };
}
