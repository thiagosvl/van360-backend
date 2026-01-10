import { PLANO_PROFISSIONAL } from "../config/constants.js";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import { getBillingConfig } from "./configuracao.service.js";

/**
 * Helper: Calcula preços e franquia de um plano
 */
export function calcularPrecosEFranquia(plano: any): {
  precoAplicado: number;
  precoOrigem: string;
  franquiaContratada: number;
} {
  const precoAplicado = Number(
    plano.promocao_ativa ? plano.preco_promocional ?? plano.preco : plano.preco
  );
  const precoOrigem = plano.promocao_ativa ? "promocional" : "normal";
  const franquiaContratada = plano.franquia_cobrancas_mes || 0;

  return {
    precoAplicado,
    precoOrigem,
    franquiaContratada,
  };
}

/**
 * Helper: Calcula valor pro-rata baseado na data de vencimento (vigencia_fim)
 */
export function calcularValorProRata(
  valorMensal: number,
  dataVencimento?: string,
  options?: { valorMinimo?: number, diasBase?: number }
): { valorCobrar: number, diasRestantes: number } {
  const diasBase = options?.diasBase || 30;
  const valorMinimo = options?.valorMinimo ?? 0.01;

  if (!dataVencimento || valorMensal <= 0) {
    return { valorCobrar: valorMensal > 0 ? valorMensal : 0, diasRestantes: diasBase };
  }

  const hoje = new Date();
  const vencimento = new Date(dataVencimento);

  // Diferença em milissegundos
  const diffTime = vencimento.getTime() - hoje.getTime();

  // Converter para dias (arredondando para cima para cobrar o dia atual se houver fração)
  let diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // Limites: mín 1 dia, máx diasBase
  if (diasRestantes < 0) diasRestantes = 0;
  if (diasRestantes > diasBase) diasRestantes = diasBase;

  // Calculo Pro-rata: (Valor / diasBase) * Dias
  const valorProRata = (valorMensal / diasBase) * diasRestantes;

  // Arredondar para 2 casas decimais
  let valorCobrar = Math.round(valorProRata * 100) / 100;

  // GARANTIA: Se valorMensal > 0 e deu centavos, cobrar mínimo
  if (valorMensal > 0 && valorCobrar < valorMinimo) {
    valorCobrar = valorMinimo;
  }

  return { valorCobrar, diasRestantes };
}

/**
 * Calcula o preço para um plano Profissional personalizado
 * EXPORTADA para ser usada no Registro também
 */
export async function calcularPrecoPersonalizado(
  quantidade: number,
  ignorarMinimo: boolean = false
): Promise<{
  precoCalculado: number;
  quantidadeMinima: number;
}> {
  // Buscar configurações de billing (apenas valores de blocos agora)
  const billingConfig = await getBillingConfig();

  // 1. Buscar o Plano Profissional (Pai)
  const { data: planoPai, error: planoPaiError } = await supabaseAdmin
    .from("planos")
    .select("id")
    .eq("slug", PLANO_PROFISSIONAL)
    .eq("tipo", "base")
    .single();

  if (planoPaiError || !planoPai) {
    throw new AppError("Plano Profissional base não encontrado.", 404);
  }

  // 2. Buscar TODOS os subplanos ordenados por franquia (Maior -> Menor)
  const { data: subplanos, error: subplanosError } = await supabaseAdmin
    .from("planos")
    .select(
      "id, preco, preco_promocional, promocao_ativa, franquia_cobrancas_mes"
    )
    .eq("parent_id", planoPai.id)
    .eq("tipo", "sub")
    .order("franquia_cobrancas_mes", { ascending: false });

  if (subplanosError || !subplanos || subplanos.length === 0) {
    // Se não tiver subplanos, talvez o Profissional Base seja o único (fallback simples?)
    // Mas a lógica atual depende de subplanos.
    throw new AppError("Subplanos do Plano Profissional não encontrados.", 500);
  }

  // 3. Determinar o Plano Base para Enterprise (O maior disponível)
  const planoBaseEnterprise = subplanos[0]; // Como ordenamos DESC, o primeiro é o maior
  const franquiaBase = planoBaseEnterprise.franquia_cobrancas_mes || 0;

  // -- LÓGICA ENTERPRISE (Acima da franquia do maior plano) --
  if (quantidade > franquiaBase) {
    const precoBase = Number(
      planoBaseEnterprise.promocao_ativa
        ? planoBaseEnterprise.preco_promocional ?? planoBaseEnterprise.preco
        : planoBaseEnterprise.preco
    );

    const excedente = quantidade - franquiaBase;
    const valorIncremento = billingConfig.valorIncrementoPassageiro ?? 2.5;

    const precoAdicional = excedente * valorIncremento;

    // Preço Final = Preço do Maior Plano + Adicionais
    const precoCalculado = precoBase + precoAdicional;

    return {
      precoCalculado: Math.round(precoCalculado * 100) / 100,
      quantidadeMinima: franquiaBase + 1,
    };
  }

  //-- LÓGICA PADRÃO (Encaixe nos Subplanos existentes) --
  // Identificar limite mínimo do sistema
  const quantidadeMinima = franquiaBase + 1; // Para fins de "Enterprise", mas aqui estamos no flow padrão

  // Lógica "Best Fit": Encontrar o plano mais adequado (MENOR que suporte a quantidade)
  // Ordenação atual: [90, 60, 25] (DESC)
  // Se q=50. 90>=50, 60>=50.
  // Dentre os candidatos, pegamos o último (menor franquia que atende).
  const candidatos = subplanos.filter(
    (p) => (p.franquia_cobrancas_mes || 0) >= quantidade
  );

  let planoReferencia;

  if (candidatos.length > 0) {
    // O último candidato é o menor plano que ainda suporta a quantidade
    planoReferencia = candidatos[candidatos.length - 1];
  } else {
    // Fallback para o menor plano absoluto
    planoReferencia = subplanos[subplanos.length - 1];
  }

  const franquiaRef = planoReferencia.franquia_cobrancas_mes || 0;
  const precoRef = Number(
    planoReferencia.promocao_ativa
      ? planoReferencia.preco_promocional ?? planoReferencia.preco
      : planoReferencia.preco
  );

  const valorUnitario = precoRef / franquiaRef;
  const precoCalculado = quantidade * valorUnitario;

  return {
    precoCalculado: Math.round(precoCalculado * 100) / 100,
    quantidadeMinima,
  };
}

export const pricingService = {
    calcularPrecosEFranquia,
    calcularValorProRata,
    calcularPrecoPersonalizado
}
