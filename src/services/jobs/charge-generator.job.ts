import { ASSINATURA_USUARIO_STATUS_ATIVA, ASSINATURA_USUARIO_STATUS_TRIAL, CONFIG_KEY_DIA_GERACAO_MENSALIDADES, PLANO_ESSENCIAL, PLANO_PROFISSIONAL } from "../../config/constants.js";
import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";
import { addToGenerationQueue } from "../../queues/generation.queue.js";
import { getConfigNumber } from "../configuracao.service.js";

interface JobResult {
    foundDrivers: number;
    queuedDrivers: number; // Alterado de processed para queued
    errors: number;
    details: any[];
}

export const chargeGeneratorJob = {
    async run(params: { targetMonth?: number; targetYear?: number; force?: boolean } = {}): Promise<JobResult> {
        const result: JobResult = { foundDrivers: 0, queuedDrivers: 0, errors: 0, details: [] };

        // 1. Definir Data Alvo
        const now = new Date();
        let targetMonth = params.targetMonth;
        let targetYear = params.targetYear;

        if (!targetMonth || !targetYear) {
            const diaGeracao = await getConfigNumber(CONFIG_KEY_DIA_GERACAO_MENSALIDADES, 25);
            const hoje = now.getDate();

            if (hoje < diaGeracao && !params.force) {
                logger.info({ hoje, diaGeracao }, "Job ignorado: Ainda não é dia de gerar mensalidades.");
                return result; 
            }
            
            if (params.force) {
                logger.info("FORCE MODE: Ignorando verificação de dia de geração.");
            }

            const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            targetMonth = nextMonthDate.getMonth() + 1; 
            targetYear = nextMonthDate.getFullYear();
            
            logger.info({ targetMonth, targetYear, diaGeracao }, "Automático: Data atingida, iniciando dispatch...");
        }

        logger.info({ targetMonth, targetYear }, "Iniciando Job de DISPATCH de Mensalidades");

        try {
            // 2. Buscar IDs dos Planos
            const { data: planosData, error: planosError } = await supabaseAdmin
                .from("planos")
                .select("id, slug")
                .in("slug", [PLANO_ESSENCIAL, PLANO_PROFISSIONAL]);

            if (planosError) throw planosError;

            const planIds = planosData?.map(p => p.id) || [];
            
            if (planIds.length === 0) {
                logger.warn("Nenhum plano elegível encontrado no banco.");
                return result;
            }

            // 3. Buscar Motoristas Elegíveis
            const { data: assinaturas, error: subError } = await supabaseAdmin
                .from("assinaturas_usuarios")
                .select("usuario_id, status, plano_id, usuarios(id, nome), planos:plano_id(slug)") 
                .in("status", [ASSINATURA_USUARIO_STATUS_ATIVA, ASSINATURA_USUARIO_STATUS_TRIAL]) 
                .in("plano_id", planIds)
                .is("cancelamento_manual", null); 

            if (subError) throw subError;

            if (!assinaturas || assinaturas.length === 0) {
                 logger.info("Nenhuma assinatura elegível encontrada.");
                 return result;
            }

            const motoristas = assinaturas
                .map((a: any) => ({
                    ...a.usuarios,
                    planoSlug: a.planos?.slug
                })) 
                .filter((u: any) => !!u.id); 
            
            result.foundDrivers = motoristas.length;

            // 4. Dispatch para a Fila (Async)
            for (const motorista of motoristas) {
                try {
                    // IDEMPOTÊNCIA:
                    // O addToGenerationQueue gerencia o Job ID internamente: `gen-{id}-{mes}-{ano}`
                    // Se rodar 2x, o Redis deduplica.
                    await addToGenerationQueue({
                        motoristaId: motorista.id,
                        mes: targetMonth,
                        ano: targetYear,
                        planoSlug: motorista.planoSlug
                    });
                    
                    result.queuedDrivers++;
                } catch (err: any) {
                    logger.error({ err: err.message, driverId: motorista.id }, "Erro ao enfileirar geração para motorista");
                    result.errors++;
                    result.details.push({ driverId: motorista.id, error: err.message });
                }
            }

            logger.info(result, "Job de Dispatch Concluído (Processamento ocorrerá em background)");
            return result;

        } catch (err: any) {
            logger.error({ err }, "Falha Crítica no Job de Dispatch");
            throw err;
        }
    }
};
