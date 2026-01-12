import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { ChargeStatus, CobrancaOrigem, ConfigKey, PassageiroDesativacaoCobrancaAutomaticaMotivo } from "../types/enums.js";
import { cobrancaService } from "./cobranca.service.js";
import { getConfigNumber } from "./configuracao.service.js";

/**
 * Verifica se já passou do dia de geração automática e cria a do mês seguinte se necessário
 */
const _verificarGerarCobrancaMesSeguinte = async (
    passageiroId: string,
    passageiroData: any,
    usuarioId: string
): Promise<any> => {
    const diaGeracao = await getConfigNumber(ConfigKey.DIA_GERACAO_MENSALIDADES, 25);
    const hoje = new Date();
    
    // Se hoje >= dia 25, significa que o job mensal já rodou. 
    // Precisamos gerar a de Fevereiro (mês seguinte) agora para este novo passageiro.
    if (hoje.getDate() >= diaGeracao) {
        const nextMonthDate = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
        const targetMonth = nextMonthDate.getMonth() + 1;
        const targetYear = nextMonthDate.getFullYear();
        
        // Calcular Vencimento
        const diaVencimento = passageiroData.dia_vencimento || 10;
        const lastDayOfMonth = new Date(targetYear, targetMonth, 0).getDate();
        const diaFinal = Math.min(diaVencimento, lastDayOfMonth);
        const dataVencimentoStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(diaFinal).padStart(2, '0')}`;

        return await cobrancaService.createCobranca({
            passageiro_id: passageiroId,
            mes: targetMonth,
            ano: targetYear,
            valor: passageiroData.valor_cobranca,
            data_vencimento: dataVencimentoStr,
            status: ChargeStatus.PENDENTE,
            usuario_id: usuarioId,
            origem: CobrancaOrigem.AUTOMATICA
        });
    }
    return null;
};

export const automationService = {
    // Exposing the verify method for other services (like passageiro creation)
    verificarGerarCobrancaMesSeguinte: _verificarGerarCobrancaMesSeguinte,

    async ativarPassageirosAutomaticamente(
        usuarioId: string,
        franquia: number
    ): Promise<{ ativados: number; totalAtivos: number }> {
        const { data: jaAtivos, error: errorJaAtivos } = await supabaseAdmin
            .from("passageiros")
            .select("id")
            .eq("usuario_id", usuarioId)
            .eq("ativo", true)
            .eq("enviar_cobranca_automatica", true);

        if (errorJaAtivos) {
            throw new Error(`Erro ao buscar passageiros já ativos: ${errorJaAtivos.message}`);
        }

        const quantidadeJaAtiva = jaAtivos?.length || 0;
        const quantidadeParaAtivar = franquia - quantidadeJaAtiva;

        logger.info({ usuarioId, franquia, jaAtivos: quantidadeJaAtiva, paraAtivar: quantidadeParaAtivar }, "[ativarPassageirosAutomaticamente] Iniciando ativação");

        if (quantidadeParaAtivar <= 0) {
            logger.info({ usuarioId }, "[ativarPassageirosAutomaticamente] Nenhum passageiro para ativar (franquia já preenchida ou excedida)");
            return { ativados: 0, totalAtivos: quantidadeJaAtiva };
        }

        const { data: disponiveis, error: errorDisponiveis } = await supabaseAdmin
            .from("passageiros")
            .select("id, nome, enviar_cobranca_automatica, origem_desativacao_cobranca_automatica, valor_cobranca, dia_vencimento")
            .eq("usuario_id", usuarioId)
            .eq("ativo", true)
            .eq("enviar_cobranca_automatica", false)
            .or("origem_desativacao_cobranca_automatica.is.null,origem_desativacao_cobranca_automatica.neq.manual")
            .order("nome", { ascending: true })
            .limit(quantidadeParaAtivar);

        if (errorDisponiveis) {
            throw new Error(`Erro ao buscar passageiros disponíveis: ${errorDisponiveis.message}`);
        }

        logger.info({ disponiveis: disponiveis?.length || 0 }, "[ativarPassageirosAutomaticamente] Passageiros disponíveis encontrados");

        if (!disponiveis || disponiveis.length === 0) {
            logger.info("[ativarPassageirosAutomaticamente] Nenhum passageiro disponível para ativar");
            return { ativados: 0, totalAtivos: quantidadeJaAtiva };
        }

        const idsParaAtivar = disponiveis.map((p) => p.id);
        logger.info({ idsParaAtivar }, "[ativarPassageirosAutomaticamente] Ativando passageiros");
        
        const { error: updateError } = await supabaseAdmin
            .from("passageiros")
            .update({
                enviar_cobranca_automatica: true,
                origem_desativacao_cobranca_automatica: null,
            })
            .in("id", idsParaAtivar);

        if (updateError) {
            throw new Error(`Erro ao atualizar passageiros: ${updateError.message}`);
        }

        // NOVO: Verificar se precisa gerar cobrança do mês seguinte (Catch-up de Upgrade)
        // Se o upgrade ocorrer após o dia 25, o job mensal já passou. Precisamos garantir Fev/Mar etc.
        logger.info(`[ativarPassageirosAutomaticamente] Verificando geração de cobrança pós-upgrade para ${idsParaAtivar.length} passageiros`);
        
        for (const passageiro of disponiveis) {
            try {
                // Prepara objeto passageiroData mínimo necessário para a função auxiliar
                const passageiroData = {
                    valor_cobranca: passageiro.valor_cobranca,
                    dia_vencimento: passageiro.dia_vencimento
                };
                
                await _verificarGerarCobrancaMesSeguinte(passageiro.id, passageiroData, usuarioId);

            } catch (err: any) {
                 logger.error({ err, passageiroId: passageiro.id }, "Erro ao gerar cobrança de catch-up no upgrade");
            }
        }

        logger.info({ count: idsParaAtivar.length }, "[ativarPassageirosAutomaticamente] Passageiros ativados com sucesso");

        return {
            ativados: idsParaAtivar.length,
            totalAtivos: quantidadeJaAtiva + idsParaAtivar.length,
        };
    },

    async desativarAutomacaoTodosPassageiros(usuarioId: string): Promise<number> {
        if (!usuarioId) throw new Error("Usuário obrigatório");

        const { data: passageiros, error: findError } = await supabaseAdmin
            .from("passageiros")
            .select("id")
            .eq("usuario_id", usuarioId)
            .eq("enviar_cobranca_automatica", true);

        if (findError) throw findError;

        if (!passageiros || passageiros.length === 0) return 0;

        const ids = passageiros.map(p => p.id);

        const { error: updateError } = await supabaseAdmin
            .from("passageiros")
            .update({
                enviar_cobranca_automatica: false,
                origem_desativacao_cobranca_automatica: PassageiroDesativacaoCobrancaAutomaticaMotivo.AUTOMATICO,
            })
            .in("id", ids);

        if (updateError) throw new Error("Erro ao desativar automação: " + updateError.message);

        return ids.length;
    }
};
