import { PLANO_COMPLETO } from "../config/contants.js";
import { supabaseAdmin } from "../config/supabase.js";
// Helper para buscar configurações da tabela configuracao_interna com fallbacks
async function getConfiguracao(chave, fallback) {
    try {
        const { data, error } = await supabaseAdmin
            .from("configuracao_interna")
            .select("valor")
            .eq("chave", chave)
            .maybeSingle();
        if (error || !data?.valor) {
            return fallback;
        }
        // Tentar converter para número se o fallback for número
        if (typeof fallback === "number") {
            const numValue = parseFloat(data.valor);
            return isNaN(numValue) ? fallback : numValue;
        }
        return data.valor;
    }
    catch (error) {
        console.error(`Erro ao buscar configuração ${chave}:`, error);
        return fallback;
    }
}
export const planoService = {
    async listPlanos(filtros) {
        let query = supabaseAdmin
            .from("planos")
            .select("*")
            .order("ordem_exibicao", { ascending: true });
        if (filtros?.slug)
            query = query.eq("slug", filtros.slug);
        if (filtros?.ativo !== undefined) {
            query = query.eq("ativo", filtros.ativo === "true");
        }
        const { data, error } = await query;
        if (error)
            throw error;
        return data || [];
    },
    /**
     * Calcula o preço preview para quantidade personalizada do Plano Completo
     * @param quantidade - Quantidade de cobranças desejada
     * @returns Objeto com preçoTotal, valorPorCobranca, ou null se a quantidade for inválida
     */
    async calcularPrecoPreview(quantidade) {
        if (!quantidade || quantidade < 1) {
            return null;
        }
        try {
            // Buscar maior subplano do Plano Completo
            const { data: planosCompleto, error: planoError } = await supabaseAdmin
                .from("planos")
                .select("id, slug")
                .eq("slug", PLANO_COMPLETO)
                .eq("tipo", "base")
                .eq("ativo", true)
                .maybeSingle();
            if (planoError || !planosCompleto) {
                throw new Error("Plano Completo não encontrado");
            }
            const { data: subPlanos, error: subPlanosError } = await supabaseAdmin
                .from("planos")
                .select("*")
                .eq("parent_id", planosCompleto.id)
                .eq("tipo", "sub")
                .eq("ativo", true)
                .order("franquia_cobrancas_mes", { ascending: false });
            if (subPlanosError || !subPlanos || subPlanos.length === 0) {
                throw new Error("Sub-planos do Completo não encontrados");
            }
            // Maior subplano (maior franquia)
            const maiorSubplano = subPlanos[0];
            const quantidadeMinima = maiorSubplano.franquia_cobrancas_mes + 1;
            if (quantidade < quantidadeMinima) {
                return null;
            }
            // Preço base (com promoção se ativa)
            const precoBase = maiorSubplano.promocao_ativa
                ? maiorSubplano.preco_promocional ?? maiorSubplano.preco
                : maiorSubplano.preco;
            const franquiaBase = maiorSubplano.franquia_cobrancas_mes;
            const cobrancasAdicionais = quantidade - franquiaBase;
            const precoCalculado = precoBase + cobrancasAdicionais * precoBase;
            // Calcular valor por cobrança (média do preço total dividido pela quantidade)
            const valorPorCobranca = precoCalculado / quantidade;
            return {
                precoTotal: Math.round(precoCalculado * 100) / 100,
                valorPorCobranca: Math.round(valorPorCobranca * 100) / 100,
            };
        }
        catch (error) {
            console.error("Erro ao calcular preço preview:", error);
            throw new Error(error?.message || "Erro ao calcular preço preview");
        }
    },
};
