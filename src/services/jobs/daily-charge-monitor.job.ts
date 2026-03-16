import {
    JOB_ORIGIN_DAILY,
    JOB_ORIGIN_FORCE,
    PASSENGER_EVENT_DUE_SOON,
    PASSENGER_EVENT_DUE_TODAY,
    PASSENGER_EVENT_OVERDUE
} from "../../config/constants.js";
import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";
import { AssinaturaStatus, AtividadeAcao, AtividadeEntidadeTipo, CobrancaStatus, ConfigKey } from "../../types/enums.js";
import { toLocalDateString } from "../../utils/date.utils.js";
import { getConfigNumber } from "../configuracao.service.js";
import { historicoService } from "../historico.service.js";
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
        const hojeStr = toLocalDateString(hoje);

        try {
            logger.info("Iniciando Job Diário de Monitoramento de Mensalidades");

            // 1. Configurações
            const diasAntecedencia = params.diasAntecedenciaOverride ?? await getConfigNumber(ConfigKey.DIAS_ANTECEDENCIA_AVISO_VENCIMENTO, 3);
            
            // Calculando Datas Chaves
            
            // A) Vence em Breve (Hoje + N)
            const dataAviso = new Date();
            dataAviso.setDate(hoje.getDate() + diasAntecedencia);
            const dataAvisoStr = toLocalDateString(dataAviso);

            // B) Vence Hoje (Hoje)
            // hojeStr ja temos

            // C) Atrasados (Regra: até X dias após vencimento)
            const diasPosVencimento = await getConfigNumber(ConfigKey.DIAS_COBRANCA_POS_VENCIMENTO, 3);
            const datasAtraso: string[] = [];
            
            for (let i = 1; i <= diasPosVencimento; i++) {
                const d = new Date();
                d.setDate(hoje.getDate() - i);
                datasAtraso.push(toLocalDateString(d));
            }

            // 2. Buscar TUDO que se encaixa nessas datas E está pendente
            const datasDeInteresse = [dataAvisoStr, hojeStr, ...datasAtraso];
            
            // 2. Buscar Mensalidades Pendentes nas datas alvo
            // Embargo de 24h: Só processamos Mensalidades de motoristas cuja assinatura foi ativada há mais de 24h
            const timestamp24hAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

            const { data: cobrancas, error: cobError } = await supabaseAdmin
                .from("cobrancas")
                .select(`
                    id, valor, data_vencimento, status, qr_code_payload, usuario_id,
                    passageiros!inner (
                        id, nome, nome_responsavel, telefone_responsavel,
                        enviar_cobranca_automatica
                    ),
                    usuarios!inner ( 
                        nome, apelido, telefone,
                        assinaturas_usuarios!inner (
                            status,
                            data_ativacao
                        )
                    )
                `)
                .eq("status", CobrancaStatus.PENDENTE)
                .in("data_vencimento", datasDeInteresse)
                .eq("passageiros.enviar_cobranca_automatica", true)
                .eq("usuarios.assinaturas_usuarios.status", AssinaturaStatus.ATIVA)
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
                const vencimentoStr = cobranca.data_vencimento;

                if (vencimentoStr === dataAvisoStr) {
                    context = PASSENGER_EVENT_DUE_SOON;
                } else if (vencimentoStr === hojeStr) {
                    context = PASSENGER_EVENT_DUE_TODAY;
                } else if (vencimentoStr < hojeStr) {
                    context = PASSENGER_EVENT_OVERDUE;
                }

                if (!context) continue;

                // 4. Verificar se JÁ ENVIAMOS hoje (Idempotência Diária) via Histórico de Atividades
                if (!params.force) {
                    const historico = await historicoService.listByEntidade(AtividadeEntidadeTipo.COBRANCA, cobranca.id);
                    const jaEnviadoHoje = historico.some(h => 
                        h.acao === AtividadeAcao.NOTIFICACAO_WHATSAPP && 
                        h.meta?.tipo_evento === context &&
                        new Date(h.created_at).toDateString() === hoje.toDateString()
                    );
                    
                    if (jaEnviadoHoje) {
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
                            nomePassageiro: passageiro.nome || "Passageiro",
                            nomeMotorista: motorista.nome || "Motorista",
                            apelidoMotorista: motorista.apelido,
                            valor: cobranca.valor,
                            dataVencimento: cobranca.data_vencimento,
                            diasAntecedencia: context === PASSENGER_EVENT_DUE_SOON ? diasAntecedencia : undefined,
                            pixPayload: cobranca.qr_code_payload,
                            
                            // Calculo de dias de atraso se for overdue
                            diasAtraso: context === PASSENGER_EVENT_OVERDUE ? Math.floor((new Date().getTime() - new Date(cobranca.data_vencimento).getTime()) / (1000 * 3600 * 24)) : undefined,
                            usuarioId: cobranca.usuario_id,
                            telefoneMotorista: motorista.telefone
                        }
                    );

                    if (enviou) {
                        const now = new Date(); // Garante mesma data para log e update
                        
                        // 1. Atualizar registro mestre da cobrança
                        await supabaseAdmin
                           .from("cobrancas")
                           .update({ data_envio_ultima_notificacao: now })
                           .eq("id", cobranca.id);

                        // 2. Gravar log histórico unificado
                        historicoService.log({
                            usuario_id: cobranca.usuario_id,
                            entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
                            entidade_id: cobranca.id,
                            acao: AtividadeAcao.NOTIFICACAO_WHATSAPP,
                            descricao: `Aviso de cobrança (${context}) enviado automaticamente via WhatsApp.`,
                            meta: {
                                tipo_evento: context,
                                tipo_origem: params.force ? JOB_ORIGIN_FORCE : JOB_ORIGIN_DAILY,
                                canal: "WHATSAPP",
                                automatico: true
                            }
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
