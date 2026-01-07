import { PLANO_ESSENCIAL, PLANO_PROFISSIONAL } from "../../config/contants.js";
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
            const diaGeracao = await getConfigNumber("DIA_GERACAO_MENSALIDADES", 25);
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

            // 3. Buscar Assinaturas Ativas com esses Planos
            const { data: assinaturas, error: subError } = await supabaseAdmin
                .from("assinaturas_usuarios")
                .select("usuario_id, status, plano_id, usuarios(id, nome)") // plano_id correto
                .eq("status", "ativa") // Campo 'status' é texto segundo o print ou boolean/enum
                                       // No print parece varchar. No constants.ts temos status "ativa"
                .in("plano_id", planIds);

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
                // logger.info({ driver: motorista.nome }, "Processando motorista...");

                // 4. Buscar Passageiros Ativos do Motorista
                const { data: passageiros, error: passError } = await supabaseAdmin
                    .from("passageiros")
                    .select("id, nome, valor_mensalidade, dia_vencimento")
                    .eq("usuario_id", motorista.id)
                    .eq("ativo", true);

                if (passError) {
                    logger.error({ err: passError, driverId: motorista.id }, "Erro ao buscar passageiros");
                    continue;
                }

                if (!passageiros) continue;

                // 5. Iterar por Passageiro e Gerar Cobrança
                for (const passageiro of passageiros) {
                    try {
                        // Verificar se já existe cobrança para este mês/ano/passageiro
                        const { count } = await supabaseAdmin
                            .from("cobrancas")
                            .select("id", { count: "exact", head: true })
                            .eq("passageiro_id", passageiro.id)
                            .eq("mes", targetMonth)
                            .eq("ano", targetYear);

                        if (count && count > 0) {
                            result.skippedCharges++;
                            continue; // Já existe
                        }

                        // Calcular Vencimento
                        // Dia de vencimento do passageiro ou dia 10 (fallback) ou dia 28 (se for > dias no mes)
                        const diaVencimento = passageiro.dia_vencimento || 10;
                        
                        // Validar data (ex: dia 31 em Fev)
                        // JS trata overflow de data automaticamente? Sim. new Date(2024, 1, 31) vira Março.
                        // Mas queremos manter no mês alvo. 
                        const lastDayOfMonth = new Date(targetYear, targetMonth, 0).getDate();
                        const diaFinal = Math.min(diaVencimento, lastDayOfMonth);

                        // Formatar data YYYY-MM-DD
                        const dataVencimentoStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(diaFinal).padStart(2, '0')}`;

                        // Valor (Pode ter lógica de pro-rata no futuro, por enquanto Valor Cheio)
                        const valorCobranca = passageiro.valor_mensalidade;
                        if (!valorCobranca || valorCobranca <= 0) {
                            // Pula passageiros sem valor definido
                            continue; 
                        }

                        // Criar Cobrança (Isso já gera o PIX via cobrancaService)
                        await cobrancaService.createCobranca({
                            passageiro_id: passageiro.id,
                            usuario_id: motorista.id,
                            mes: targetMonth,
                            ano: targetYear,
                            valor: valorCobranca,
                            data_vencimento: dataVencimentoStr,
                            status: "pendente",
                            origem: "automatico-job"
                        });

                        result.createdCharges++;

                    } catch (genError: any) {
                        logger.error({ err: genError.message, passageiroId: passageiro.id }, "Erro ao gerar cobrança individual");
                        result.errors++;
                        result.details.push({ passageiro: passageiro.nome, erro: genError.message });
                    }
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
