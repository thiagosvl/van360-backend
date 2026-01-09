import {
    ASSINATURA_USUARIO_STATUS_ATIVA,
    COBRANCA_STATUS_PENDENTE,
    CONFIG_KEY_DIAS_ANTECEDENCIA_AVISO_VENCIMENTO,
    JOB_ORIGIN_DAILY,
    JOB_ORIGIN_FORCE,
    PASSENGER_EVENT_DUE_SOON,
    PASSENGER_EVENT_DUE_TODAY,
    PASSENGER_EVENT_OVERDUE
} from "../../config/constants.js";
import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";
import { getConfigNumber } from "../configuracao.service.js";
import { notificationService } from "../notifications/notification.service.js";

interface JobResult {
    processed: number;
    sent: number;
    errors: number;
    details: any[];
}

export const dailyChargeMonitorJob = {
    async run(params: { force?: boolean; diasAntecedenciaOverride?: number } = {}): Promise<JobResult> {
        const result: JobResult = { processed: 0, sent: 0, errors: 0, details: [] };
        const hoje = new Date();
        const hojeStr = hoje.toISOString().split('T')[0];

        try {
            logger.info("Iniciando Job Diário de Monitoramento de Cobranças");

            // 1. Configurações
            const diasAntecedencia = params.diasAntecedenciaOverride ?? await getConfigNumber(CONFIG_KEY_DIAS_ANTECEDENCIA_AVISO_VENCIMENTO, 2);
            
            // Calculando Datas Chaves
            
            // A) Vence em Breve (Hoje + N)
            const dataAviso = new Date();
            dataAviso.setDate(hoje.getDate() + diasAntecedencia);
            const dataAvisoStr = dataAviso.toISOString().split('T')[0];

            // B) Vence Hoje (Hoje)
            // hojeStr ja temos

            // C) Atrasados (Regra: 1 dia, 3 dias, 5 dias após vencimento)
            const atraso1d = new Date(); atraso1d.setDate(hoje.getDate() - 1);
            const atraso3d = new Date(); atraso3d.setDate(hoje.getDate() - 3);
            const atraso5d = new Date(); atraso5d.setDate(hoje.getDate() - 5);
            
            const datasAtraso = [
                atraso1d.toISOString().split('T')[0],
                atraso3d.toISOString().split('T')[0],
                atraso5d.toISOString().split('T')[0]
            ];

            // 2. Buscar TUDO que se encaixa nessas datas E está pendente
            const datasDeInteresse = [dataAvisoStr, hojeStr, ...datasAtraso];
            
            // 2. Buscar Cobranças Pendentes nas datas alvo
            // Embargo de 24h: Só processamos cobranças de motoristas cuja assinatura foi ativada há mais de 24h
            const timestamp24hAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

            const { data: cobrancas, error: cobError } = await supabaseAdmin
                .from("cobrancas")
                .select(`
                    id, valor, data_vencimento, status, qr_code_payload,
                    passageiros!inner (
                        id, nome, nome_responsavel, telefone_responsavel,
                        enviar_cobranca_automatica
                    ),
                    usuarios!inner ( 
                        nome,
                        assinaturas_usuarios!inner (
                            status,
                            data_ativacao
                        )
                    )
                `)
                .eq("status", COBRANCA_STATUS_PENDENTE)
                .in("data_vencimento", datasDeInteresse)
                .eq("passageiros.enviar_cobranca_automatica", true)
                .eq("usuarios.assinaturas_usuarios.status", ASSINATURA_USUARIO_STATUS_ATIVA)
                .lte("usuarios.assinaturas_usuarios.data_ativacao", timestamp24hAgo);

            if (cobError) throw cobError;
            
            logger.info({ found: cobrancas?.length, datasDeInteresse }, "Cobranças encontradas para análise");

            if (!cobrancas) return result;

            // 3. Processar cada uma
            for (const cobranca of cobrancas) {
                result.processed++;
                const passageiro = cobranca.passageiros as any;
                const motorista = cobranca.usuarios as any;
                
                if (!passageiro?.telefone_responsavel) continue;

                // Definir Contexto
                let context: string | null = null;
                const vecimentoStr = cobranca.data_vencimento;

                if (vecimentoStr === dataAvisoStr) {
                    context = PASSENGER_EVENT_DUE_SOON;
                } else if (vecimentoStr === hojeStr) {
                    context = PASSENGER_EVENT_DUE_TODAY;
                } else if (vecimentoStr < hojeStr) {
                    context = PASSENGER_EVENT_OVERDUE;
                }

                if (!context) continue;

                // 4. Verificar se JÁ ENVIAMOS hoje (Idempotência Diária)
                if (!params.force) {
                    const { count } = await supabaseAdmin
                        .from("cobranca_notificacoes")
                        .select("id", { count: "exact", head: true })
                        .eq("cobranca_id", cobranca.id)
                        .eq("tipo_evento", context)
                        .gte("data_envio", hojeStr + "T00:00:00"); 
                    
                    if (count && count > 0) {
                        continue; // Já processado hoje
                    }
                }

                // 5. Enviar
                try {
                    const enviou = await notificationService.notifyPassenger(
                        passageiro.telefone_responsavel,
                        context as any,
                        {
                            nomeResponsavel: passageiro.nome_responsavel || "Responsável",
                            nomePassageiro: passageiro.nome || "Aluno",
                            nomeMotorista: motorista.nome || "Motorista",
                            valor: cobranca.valor,
                            dataVencimento: cobranca.data_vencimento,
                            diasAntecedencia: context === PASSENGER_EVENT_DUE_SOON ? diasAntecedencia : undefined,
                            pixPayload: cobranca.qr_code_payload,
                            
                            // Calculo de dias de atraso se for overdue
                            diasAtraso: context === PASSENGER_EVENT_OVERDUE ? Math.floor((new Date().getTime() - new Date(cobranca.data_vencimento).getTime()) / (1000 * 3600 * 24)) : undefined
                        }
                    );

                    if (enviou) {
                        await supabaseAdmin.from("cobranca_notificacoes").insert({
                            cobranca_id: cobranca.id,
                            tipo_evento: context,
                            tipo_origem: params.force ? JOB_ORIGIN_FORCE : JOB_ORIGIN_DAILY,
                            canal: "WHATSAPP",
                            data_envio: new Date().toISOString()
                        });
                        result.sent++;
                    } else {
                        result.errors++;
                        result.details.push({ id: cobranca.id, error: "Falha envio WhatsApp" });
                    }

                } catch (err: any) {
                    logger.error({ err, id: cobranca.id }, "Erro ao processar notificação");
                    result.errors++;
                }
            }

            return result;

        } catch (error: any) {
            logger.error({ error }, "Erro fatal no DailyChargeJob");
            throw error;
        }
    }
};
