import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";
import { getConfigNumber } from "../configuracao.service.js";
import { notificationService } from "../notifications/notification.service.js";

interface JobResult {
    processedCharges: number;
    notificationsSent: number;
    errors: number;
    details: any[];
}

export const notifyDueSoonJob = {
    async run(params: { force?: boolean; diasAntecedenciaOverride?: number } = {}): Promise<JobResult> {
        const result: JobResult = { processedCharges: 0, notificationsSent: 0, errors: 0, details: [] };
        
        try {
            // 1. Configuração: Dias de antecedência
            // Se passar override (teste manual), usa ele. Senão busca do banco.
            const diasAntecedencia = params.diasAntecedenciaOverride ?? await getConfigNumber("DIAS_ANTECEDENCIA_AVISO_VENCIMENTO", 2);
            
            // 2. Calcular Data Alvo (Hoje + N dias)
            const hoje = new Date();
            const dataAlvo = new Date();
            dataAlvo.setDate(hoje.getDate() + diasAntecedencia);
            
            // Converter para string YYYY-MM-DD para busca no banco (assumindo tipo DATE)
            const dataAlvoStr = dataAlvo.toISOString().split('T')[0];

            logger.info({ dataAlvoStr, diasAntecedencia, force: params.force }, "Iniciando Job de Notificação de Vencimento");

            // 3. Buscar Cobranças Pendentes vencendo na Data Alvo
            const { data: cobrancas, error: cobError } = await supabaseAdmin
                .from("cobrancas")
                .select(`
                    id, 
                    valor, 
                    data_vencimento,
                    usuario_id,
                    passageiro_id,
                    qr_code_payload,
                    passageiros (
                        id, 
                        nome, 
                        nome_responsavel, 
                        telefone_responsavel, 
                        enviar_cobranca_automatica
                    ),
                    usuarios (
                        nome
                    )
                `)
                .eq("status", "pendente")
                .eq("data_vencimento", dataAlvoStr);

            if (cobError) throw cobError;

            if (!cobrancas || cobrancas.length === 0) {
                logger.info("Nenhuma cobrança pendente para notificar para data vencimento: " + dataAlvoStr);
                return result;
            }

            result.processedCharges = cobrancas.length;

            // 4. Iterar e Enviar Notificação
            for (const cobranca of cobrancas) {
                const passageiro = cobranca.passageiros as any;
                const motorista = cobranca.usuarios as any;

                // Validar Telefone
                if (!passageiro?.telefone_responsavel) {
                    continue; 
                }

                // 5. Verificar se já foi notificado hoje ou recentemente para essa cobrança
                
                if (!params.force) {
                    // Se NÃO for force, verifica histórico para evitar spam
                    const { count } = await supabaseAdmin
                        .from("cobranca_notificacoes")
                        .select("id", { count: "exact", head: true })
                        .eq("cobranca_id", cobranca.id)
                        .eq("tipo_evento", "AVISO_VENCIMENTO");
                    
                    if (count && count > 0) {
                        continue; // Já notificado
                    }
                } else {
                    logger.info({ cobrancaId: cobranca.id }, "FORCE MODE: Ignorando verificação de notificação prévia.");
                }

                // 6. Enviar Notificação via Service Centralizado
                const nomeResponsavel = passageiro.nome_responsavel || "Responsável";
                const nomePassageiro = passageiro.nome || "Aluno";
                const nomeMotorista = motorista.nome || "Motorista";

                try {
                     const enviou = await notificationService.notifyPassenger(
                        passageiro.telefone_responsavel,
                        "DUE_SOON", 
                        {
                            nomeResponsavel,
                            nomePassageiro,
                            nomeMotorista,
                            valor: cobranca.valor,
                            dataVencimento: cobranca.data_vencimento,
                            diasAntecedencia,
                            pixPayload: cobranca.qr_code_payload
                        }
                    );
                    
                    if (enviou) {
                        // 7. Registrar Notificação no Banco
                        await supabaseAdmin.from("cobranca_notificacoes").insert({
                            cobranca_id: cobranca.id,
                            tipo_evento: "AVISO_VENCIMENTO",
                            tipo_origem: params.force ? "JOB_MANUAL_FORCE" : "JOB_AUTOMATICO",
                            canal: "WHATSAPP",
                            data_envio: new Date().toISOString()
                        });
                        
                        result.notificationsSent++;
                    } else {
                        result.errors++;
                        result.details.push({ id: cobranca.id, erro: "Falha no envio do WhatsApp" });
                    }
                } catch (sendError: any) {
                    logger.error({ error: sendError, cobrancaId: cobranca.id }, "Erro no envio de notificação");
                    result.errors++;
                }
            }

            logger.info(result, "Job de Notificações Concluído");
            return result;

        } catch (error: any) {
            logger.error({ error }, "Erro fatal no Job de Notificações");
            throw error;
        }
    }
};
