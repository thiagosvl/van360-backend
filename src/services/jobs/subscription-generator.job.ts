import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";
import { ConfigKey, SubscriptionChargeStatus, UserSubscriptionStatus } from "../../types/enums.js";
import { assinaturaCobrancaService } from "../assinatura-cobranca.service.js";
import { getConfigNumber } from "../configuracao.service.js";

interface JobResult {
    processed: number;
    generated: number;
    errors: number;
    details: any[];
}

export const subscriptionGeneratorJob = {
    async run(params: { force?: boolean; diasAntecedenciaOverride?: number } = {}): Promise<JobResult> {
        const result: JobResult = { processed: 0, generated: 0, errors: 0, details: [] };
        
        try {
            logger.info("Iniciando Job de Geração de Assinaturas (Renovação Diária)");

            // 1. Configurações
            // Busca quantos dias antes devemos gerar a renovação (Default: 5 dias)
            const diasAntecedencia = params.diasAntecedenciaOverride ?? await getConfigNumber(ConfigKey.DIAS_ANTECEDENCIA_RENOVACAO, 5);

            // 2. Calcular Data Alvo (Hoje + Dias Anteceência)
            const hoje = new Date();
            const dataAlvo = new Date();
            dataAlvo.setDate(hoje.getDate() + diasAntecedencia);
            
            const dataAlvoStr = dataAlvo.toISOString().split('T')[0];

            logger.info({ diasAntecedencia, dataAlvoStr }, "Buscando assinaturas que vencem na data alvo");

            // 3. Buscar Assinaturas Ativas que vencem EXATAMENTE na data alvo
            // Isso evita gerar duplicado ou gerar muito cedo. O job roda todo dia, então eventualmente vai cair no dia certo.
            const { data: assinaturas, error: assError } = await supabaseAdmin
                .from("assinaturas_usuarios")
                .select("id, usuario_id, vigencia_fim, preco_aplicado, plano_id, status")
                .eq("status", UserSubscriptionStatus.ATIVA)
                .eq("vigencia_fim", dataAlvoStr);

            if (assError) throw assError;

            if (!assinaturas || assinaturas.length === 0) {
                logger.info("Nenhuma assinatura vencendo na data alvo.");
                return result;
            }

            logger.info({ count: assinaturas.length }, "Assinaturas encontradas para renovação");

            // 4. Processar cada assinatura
            for (const assinatura of assinaturas) {
                result.processed++;
                
                try {
                    // Verificar se já existe cobrança gerada para essa vigencia (data_vencimento = vigencia_fim)
                    const dataVencimento = assinatura.vigencia_fim; 
                    
                    const { count } = await supabaseAdmin
                        .from("assinaturas_cobrancas")
                        .select("id", { count: "exact", head: true })
                        .eq("assinatura_usuario_id", assinatura.id)
                        .eq("data_vencimento", dataVencimento)
                        .neq("status", SubscriptionChargeStatus.CANCELADA); // Ignora canceladas

                    if (count && count > 0 && !params.force) {
                        logger.info({ assinaturaId: assinatura.id }, "Renovação já gerada anteriormente.");
                        continue; 
                    }

                        // Usar Service para gerar Cobrança + PIX de forma atômica/gerenciada
                    try {
                        const { cobranca } = await assinaturaCobrancaService.gerarCobrancaRenovacao({
                            usuarioId: assinatura.usuario_id,
                            assinaturaId: assinatura.id,
                            valor: assinatura.preco_aplicado,
                            dataVencimento: dataVencimento,
                            descricao: `Renovação de Assinatura`
                        });

                        result.generated++;
                        logger.info({ cobrancaId: cobranca.id }, "Cobrança de renovação gerada com sucesso via Service");

                    } catch (serviceErr: any) {
                         // O service já faz rollback se o PIX falhar, então aqui só logamos o erro do Job
                         logger.error({ serviceErr, assinaturaId: assinatura.id }, "Erro no service de renovação");
                         result.errors++;
                         result.details.push({ id: assinatura.id, msg: serviceErr.message });
                    }

                } catch (err: any) {
                    logger.error({ err, assinaturaId: assinatura.id }, "Erro ao processar renovação de assinatura");
                    result.errors++;
                    result.details.push({ id: assinatura.id, error: err.message });
                }
            }

            return result;

        } catch (error: any) {
            logger.error({ error }, "Erro fatal no SubscriptionGeneratorJob");
            throw error;
        }
    }
};
