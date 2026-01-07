import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";

export const CONFIG_KEYS = {
  PRO_RATA_DIAS_MES: "PRO_RATA_DIAS_MES",
  PRO_RATA_VALOR_MINIMO: "PRO_RATA_VALOR_MINIMO",
  VALOR_INCREMENTO_PASSAGEIRO_EXCESSO: "VALOR_INCREMENTO_PASSAGEIRO_EXCESSO",
  TAXA_INTERMEDIACAO_PIX: "TAXA_INTERMEDIACAO_PIX"
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
    taxaIntermediacaoPix
  ] = await Promise.all([
    getConfigNumber("PRO_RATA_DIAS_MES", 30),
    getConfigNumber("PRO_RATA_VALOR_MINIMO", 0.01),
    getConfigNumber("VALOR_INCREMENTO_PASSAGEIRO_EXCESSO", 2.50),
    getConfigNumber("TAXA_INTERMEDIACAO_PIX", 0.99)
  ]);

  /* Recycled variable for the new logic */
  const valorIncrementoPassageiro = incrementoBloco; 

  return {
    diasProRata,
    valorMinimoProRata,
    planoBaseId: null, 
    valorIncrementoPassageiro,
    taxaIntermediacaoPix
  };
}
