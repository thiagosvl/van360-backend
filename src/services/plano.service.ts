import { supabaseAdmin } from "../config/supabase.js";
import { pricingService } from "./pricing.service.js";

// Helper para buscar configurações da tabela configuracao_interna com fallbacks
async function getConfiguracao(
    chave: string,
    fallback: string | number
): Promise<string | number> {
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
    } catch (error) {
        console.error(`Erro ao buscar configuração ${chave}:`, error);
        return fallback;
    }
}

export const planoService = {

    async listPlanos(
        filtros?: {
            slug?: string;
            ativo?: string;
        }
    ): Promise<any[]> {
        let query = supabaseAdmin
            .from("planos")
            .select("*")
            .order("ordem_exibicao", { ascending: true });

        if (filtros?.slug) query = query.eq("slug", filtros.slug);

        if (filtros?.ativo !== undefined) {
            query = query.eq("ativo", filtros.ativo === "true");
        }

        const { data, error } = await query;
        if (error) throw error;

        return data || [];
    },

    /**
     * Calcula o preço preview para quantidade personalizada do Plano Profissional
     * @param quantidade - Quantidade de cobranças desejada
     * @returns Objeto com preçoTotal, valorPorCobranca, ou null se a quantidade for inválida
     */
    async calcularPrecoPreview(quantidade: number, ignorarMinimo: boolean = false): Promise<{
        preco: number;
        precoTotal: number;
        valorPorCobranca: number;
    } | null> {
        if (!quantidade || quantidade < 1) {
            return null;
        }

        try {
            const { precoCalculado } = await pricingService.calcularPrecoPersonalizado(quantidade, ignorarMinimo);
            
            // Calculate unit price for consistency with interface
            const valorPorCobranca = precoCalculado / quantidade;

            return {
                preco: precoCalculado, // Frontend espera 'preco'
                precoTotal: precoCalculado,
                valorPorCobranca: Math.round(valorPorCobranca * 100) / 100,
            };
        } catch (error: any) {
            console.error("Erro ao calcular preço preview:", error);
            throw new Error(
                error?.message || "Erro ao calcular preço preview"
            );
        }
    },
};
