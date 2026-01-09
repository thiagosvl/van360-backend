import { ASSINATURA_USUARIO_STATUS_ATIVA, ASSINATURA_USUARIO_STATUS_TRIAL, CONFIG_KEY_DIA_GERACAO_MENSALIDADES, PLANO_ESSENCIAL, PLANO_PROFISSIONAL } from "../../config/constants.js";
import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";
import { cobrancaService } from "../cobranca.service.js";
import { getConfigNumber } from "../configuracao.service.js";

interface JobResult {
    processedDrivers: number;
    createdCharges: number;
    skippedCharges: number;
    errors: number;
    details: any[];
}

export const chargeGeneratorJob = {
    async run(params: { targetMonth?: number; targetYear?: number; force?: boolean } = {}): Promise<JobResult> {
        const result: JobResult = { processedDrivers: 0, createdCharges: 0, skippedCharges: 0, errors: 0, details: [] };

        // 1. Definir Data Alvo (Próximo Mês por padrão)
        const now = new Date();
        // Se hoje for Jan (0), targetMonth Default = Feb (1). 
        // No JS/Date, Jan=0. Mas no nosso banco usamos Jan=1.
        
        let targetMonth = params.targetMonth;
        let targetYear = params.targetYear;

        if (!targetMonth || !targetYear) {
            // Modo Automático: Verificar se hoje é dia de gerar
            const diaGeracao = await getConfigNumber(CONFIG_KEY_DIA_GERACAO_MENSALIDADES, 25);
            const hoje = now.getDate();

            if (hoje < diaGeracao && !params.force) {
                logger.info({ hoje, diaGeracao }, "Job ignorado: Ainda não é dia de gerar mensalidades.");
                return result; // Retorna vazio, não é erro
            }
            
            if (params.force) {
                logger.info("FORCE MODE: Ignorando verificação de dia de geração.");
            }

            // Default: Mês seguinte ao atual
            const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            targetMonth = nextMonthDate.getMonth() + 1; // 1-12
            targetYear = nextMonthDate.getFullYear();
            
            logger.info({ targetMonth, targetYear, diaGeracao }, "Automático: Data atingida, iniciando geração...");
        }

        logger.info({ targetMonth, targetYear }, "Iniciando Job de Geração de Mensalidades");



        try {
            // 2. Buscar IDs dos Planos (Essencial e Profissional)
            // Precisamos dos UUIDs para buscar na tabela de assinaturas
            const { data: planosData, error: planosError } = await supabaseAdmin
                .from("planos")
                .select("id, slug")
                .in("slug", [PLANO_ESSENCIAL, PLANO_PROFISSIONAL]);

            if (planosError) throw planosError;

            // Extrair IDs
            const planIds = planosData?.map(p => p.id) || [];
            
            if (planIds.length === 0) {
                logger.warn("Nenhum plano (Essencial/Profissional) encontrado no banco.");
                return result;
            }

            // Buscar usuários (motoristas) com assinaturas ativas nos planos que permitem automação
            const { data: assinaturas, error: subError } = await supabaseAdmin
                .from("assinaturas_usuarios")
                .select("usuario_id, status, plano_id, usuarios(id, nome)") // plano_id correto
                .in("status", [ASSINATURA_USUARIO_STATUS_ATIVA, ASSINATURA_USUARIO_STATUS_TRIAL]) // Campo 'status' é texto segundo o print ou boolean/enum
                .in("plano_id", planIds)
                .is("cancelamento_manual", null); // Ignora quem já pediu cancelamento/agendou saída

            if (subError) throw subError;

            if (!assinaturas || assinaturas.length === 0) {
                 logger.info("Nenhuma assinatura elegível encontrada.");
                 return result;
            }

            // Normalizar lista de motoristas
            const motoristas = assinaturas
                .map((a: any) => a.usuarios) 
                .filter((u: any) => !!u); 
            
            result.processedDrivers = motoristas.length;

            // 4. Iterar por Motorista

            // 3. Iterar por Motorista
            for (const motorista of motoristas) {
                try {
                    const stats = await cobrancaService.gerarCobrancasMensaisParaMotorista(motorista.id, targetMonth, targetYear);
                    result.createdCharges += stats.created;
                    result.skippedCharges += stats.skipped;
                } catch (err: any) {
                    logger.error({ err: err.message, driverId: motorista.id }, "Erro ao gerar cobranças para motorista");
                    result.errors++;
                    result.details.push({ driverId: motorista.id, error: err.message });
                }
            }

            logger.info(result, "Job de Mensalidades Concluído");
            return result;

        } catch (err: any) {
            logger.error({ err }, "Falha Crítica no Job de Mensalidades");
            throw err;
        }
    }
};
