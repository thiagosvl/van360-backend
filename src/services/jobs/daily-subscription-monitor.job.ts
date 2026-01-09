import {
    ASSINATURA_COBRANCA_STATUS_PENDENTE_PAGAMENTO,
    ASSINATURA_USUARIO_STATUS_ATIVA,
    ASSINATURA_USUARIO_STATUS_CANCELADA,
    ASSINATURA_USUARIO_STATUS_SUSPENSA,
    ASSINATURA_USUARIO_STATUS_TRIAL,
    CONFIG_KEY_DIAS_ANTECEDENCIA_RENOVACAO,
    DRIVER_EVENT_ACCESS_SUSPENDED,
    DRIVER_EVENT_RENEWAL_DUE_SOON,
    DRIVER_EVENT_RENEWAL_DUE_TODAY,
    DRIVER_EVENT_RENEWAL_OVERDUE,
    DRIVER_EVENT_TRIAL_ENDING
} from "../../config/constants.js";
import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";
import { getConfigNumber } from "../configuracao.service.js";
import { notificationService } from "../notifications/notification.service.js";

interface JobResult {
    processed: number;
    notifications: number;
    suspended: number;
    errors: number;
    details: any[];
}

export const dailySubscriptionMonitorJob = {
    async run(params: { force?: boolean; diasAntecedenciaOverride?: number } = {}): Promise<JobResult> {
        const result: JobResult = { processed: 0, notifications: 0, suspended: 0, errors: 0, details: [] };
        const hoje = new Date();
        const hojeStr = hoje.toISOString().split('T')[0];

        try {
            logger.info("Iniciando Monitoramento Diário de Assinaturas (Motoristas)");

            // 1. Configurações
            const diasAntecedencia = params.diasAntecedenciaOverride ?? await getConfigNumber(CONFIG_KEY_DIAS_ANTECEDENCIA_RENOVACAO, 5);
            
            // Datas de Interesse
            
            // A) Vence em Breve (Hoje + N)
            const dataAviso = new Date();
            dataAviso.setDate(hoje.getDate() + diasAntecedencia);
            const dataAvisoStr = dataAviso.toISOString().split('T')[0];

            // B) Vence Hoje (Hoje) -> hojeStr

            // C) Venceu Ontem (Bloqueio)
            const ontem = new Date();
            ontem.setDate(hoje.getDate() - 1);
            const dataBloqueioStr = ontem.toISOString().split('T')[0];

            // D) Atraso (3 dias)
            const atraso3d = new Date(); atraso3d.setDate(hoje.getDate() - 3);
            const dataAtraso3dStr = atraso3d.toISOString().split('T')[0];

            const datasDeInteresse = [dataAvisoStr, hojeStr, dataBloqueioStr, dataAtraso3dStr];

            // 2. Buscar Cobranças Pendentes nessas datas
            const { data: cobrancas, error: cobError } = await supabaseAdmin
                .from("assinaturas_cobrancas")
                .select(`
                    id, valor, data_vencimento, status, qr_code_payload, assinatura_usuario_id,
                    assinaturas_usuarios!inner ( id, status, plano_id, planos(nome) ),
                    usuarios!inner ( id, nome, telefone )
                `)
                .eq("status", ASSINATURA_COBRANCA_STATUS_PENDENTE_PAGAMENTO)
                .in("data_vencimento", datasDeInteresse);

            if (cobError) throw cobError;

            if (!cobrancas || cobrancas.length === 0) {
                logger.info("Nenhuma assinatura pendente crítica encontrada.");
                return result;
            }

            logger.info({ count: cobrancas.length }, "Assinaturas pendentes em análise");

            for (const cobranca of cobrancas) {
                result.processed++;
                const motorista = cobranca.usuarios as any;
                const assinatura = cobranca.assinaturas_usuarios as any;
                const planoNome = assinatura.planos?.nome || "Plano";

                if (!motorista.telefone) continue;

                let context: string | null = null;
                const vencimento = cobranca.data_vencimento;

                if (vencimento === dataAvisoStr) {
                    context = DRIVER_EVENT_RENEWAL_DUE_SOON;
                     // Se for Trial, mudar mensagem para Fim de Teste
                     if (assinatura.status === ASSINATURA_USUARIO_STATUS_TRIAL) {
                        context = DRIVER_EVENT_TRIAL_ENDING;
                    }
                } else if (vencimento === hojeStr) {
                    context = DRIVER_EVENT_RENEWAL_DUE_TODAY;
                } else if (vencimento === dataBloqueioStr) {
                    // BLOQUEIO
                    context = DRIVER_EVENT_ACCESS_SUSPENDED;
                } else if (vencimento === dataAtraso3dStr) {
                    context = DRIVER_EVENT_RENEWAL_OVERDUE;
                }

                if (!context) continue;

                // 3. Verificar Histórico (Idempotência)
                try {
                    if (!params.force) {
                        const { count, error: histError } = await supabaseAdmin
                            .from("assinatura_notificacoes")
                            .select("id", { count: "exact", head: true })
                            .eq("assinatura_cobranca_id", cobranca.id)
                            .eq("tipo_evento", context)
                            // Para Bloqueio e Vencimento, queremos garantir que enviou hoje/neste ciclo
                            .gte("data_envio", hojeStr + "T00:00:00"); 

                        if (histError) {
                            if (histError.message.includes("does not exist")) {
                                logger.error("Tabela assinatura_notificacoes não existe. Rode o SQL.");
                            }
                        }

                        if (count && count > 0) {
                            continue; // Já notificado
                        }
                    }

                    // 4. Executar Ação (Bloqueio)
                    if (context === DRIVER_EVENT_ACCESS_SUSPENDED) {
                        if (assinatura.status !== ASSINATURA_USUARIO_STATUS_SUSPENSA) {
                            await supabaseAdmin
                                .from("assinaturas_usuarios")
                                .update({ status: ASSINATURA_USUARIO_STATUS_SUSPENSA, ativo: false })
                                .eq("id", assinatura.id);
                            
                            result.suspended++;
                            logger.info({ assinaturaId: assinatura.id }, "Assinatura SUSPENSA por falta de pagamento");
                        }
                    }

                    // 5. Enviar Notificação
                    const enviou = await notificationService.notifyDriver(
                        motorista.telefone,
                        context as any,
                        {
                            nomeMotorista: motorista.nome,
                            nomePlano: planoNome,
                            valor: cobranca.valor,
                            dataVencimento: cobranca.data_vencimento,
                            pixPayload: cobranca.qr_code_payload,
                            diasAtraso: context === DRIVER_EVENT_RENEWAL_OVERDUE ? 3 : undefined
                        }
                    );

                    if (enviou) {
                        result.notifications++;
                        // Registrar
                        try {
                             await supabaseAdmin.from("assinatura_notificacoes").insert({
                                assinatura_cobranca_id: cobranca.id,
                                tipo_evento: context,
                                usuario_id: motorista.id,
                                canal: "WHATSAPP",
                                data_envio: new Date().toISOString()
                            });
                        } catch (e) {
                            // Ignora erro de insert
                        }
                    }

                } catch (err: any) {
                    result.errors++;
                    logger.error({ err, cobrancaId: cobranca.id }, "Erro processando assinatura job");
                }
            }

            // 6. Inativação de Contas Abandonadas (Suspensas há mais de 30 dias)
            const dataLimiteInativacao = new Date();
            dataLimiteInativacao.setDate(hoje.getDate() - 30);
            const dataLimiteInativacaoStr = dataLimiteInativacao.toISOString().split('T')[0];

            logger.info({ dataLimite: dataLimiteInativacaoStr }, "Buscando contas abandonadas para inativação...");

            const { data: suspensasMortas } = await supabaseAdmin
                .from("assinaturas_usuarios")
                .select("id, usuario_id, status, vigencia_fim")
                .eq("status", ASSINATURA_USUARIO_STATUS_SUSPENSA)
                .lte("vigencia_fim", dataLimiteInativacaoStr);

            if (suspensasMortas && suspensasMortas.length > 0) {
                logger.info({ count: suspensasMortas.length }, "Inativando contas abandonadas");
                for (const dead of suspensasMortas) {
                    try {
                        // Inativar usuário e Marcar assinatura como cancelada
                        await supabaseAdmin
                            .from("assinaturas_usuarios")
                            .update({ status: ASSINATURA_USUARIO_STATUS_CANCELADA, ativo: false })
                            .eq("id", dead.id);
                        
                        await supabaseAdmin
                            .from("usuarios")
                            .update({ ativo: false })
                            .eq("id", dead.usuario_id);

                        logger.info({ deadId: dead.id, userId: dead.usuario_id }, "Conta INATIVADA por abandono (suspensa > 30 dias)");
                    } catch (e: any) {
                        logger.error({ deadId: dead.id, err: e.message }, "Erro ao inativar conta abandonada");
                    }
                }
            }

            // 7. Finalizar Cancelamentos Agendados (Sweeper de Validade)
            // Problema Resolvido: Como matamos a cobrança futura (Ghost Killer), 
            // o motorista não tem pendências na renovação, logo não cai na regra de Suspensão por inadimplência.
            // Precisamos encerrar a assinatura explicitamente quando a vigência acaba.
            const { data: aVencer } = await supabaseAdmin
                .from("assinaturas_usuarios")
                .select("id, usuario_id, vigencia_fim")
                .in("status", [ASSINATURA_USUARIO_STATUS_ATIVA, ASSINATURA_USUARIO_STATUS_TRIAL])
                .not("cancelamento_manual", "is", null) // Tem pedido de saída
                .lt("vigencia_fim", hojeStr); // Já venceu (vigencia < hoje)

            if (aVencer && aVencer.length > 0) {
                logger.info({ count: aVencer.length }, "Encerrando assinaturas com cancelamento agendado vencido...");
                
                const ids = aVencer.map((a: any) => a.id);

                // 1. Atualizar Assinatura -> CANCELADA
                await supabaseAdmin
                    .from("assinaturas_usuarios")
                    .update({ status: ASSINATURA_USUARIO_STATUS_CANCELADA, ativo: false })
                    .in("id", ids);
                
                logger.info({ ids }, "Assinaturas Zumbis encerradas com sucesso.");
            }

            return result;

        } catch (error: any) {
            logger.error({ error }, "Erro fatal no DailySubscriptionMonitor");
            throw error;
        }
    }
};
