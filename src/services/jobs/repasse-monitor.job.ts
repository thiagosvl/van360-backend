import { DRIVER_EVENT_REPASSE_FAILED, STATUS_CHAVE_PIX_INVALIDADA, STATUS_REPASSE_FALHA, STATUS_REPASSE_REPASSADO, STATUS_TRANSACAO_ERRO, STATUS_TRANSACAO_PROCESSANDO, STATUS_TRANSACAO_SUCESSO } from "../../config/constants.js";
import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";
import { interService } from "../inter.service.js";
import { notificationService } from "../notifications/notification.service.js";

export const repasseMonitorJob = {
    async run() {
        logger.info("Iniciando Monitoramento de Repasses (Transferências) Pendentes");

        // 1. Buscar transações de repasse em processamento (últimas 48h)
        const limite = new Date();
        limite.setHours(limite.getHours() - 48);

        const { data: pendentes, error } = await supabaseAdmin
            .from("transacoes_repasse")
            .select("*")
            .eq("status", STATUS_TRANSACAO_PROCESSANDO)
            .gte("created_at", limite.toISOString());

        if (error) {
            logger.error({ error }, "Erro ao buscar repasses pendentes");
            return;
        }

        if (!pendentes || pendentes.length === 0) {
            logger.info("Nenhum repasse pendente encontrado.");
            return;
        }

        logger.info({ count: pendentes.length }, "Verificando status de repasses...");

        for (const transacao of pendentes) {
            try {
                if (!transacao.txid_pix_repasse) {
                    logger.warn({ id: transacao.id }, "Repasse processando sem EndToEndId. Verificando falha manual.");
                    continue;
                }

                // 2. Consultar Status no Inter
                // txid_pix_repasse armazena o End2EndId do PIX
                const pixInfo = await interService.consultarPix(supabaseAdmin, transacao.txid_pix_repasse);
                const statusInter = pixInfo.status; // REALIZADO, REJEITADO, FALHA...

                let novoStatus = STATUS_TRANSACAO_PROCESSANDO;
                
                if (statusInter === "REALIZADO" || statusInter === "PAGO") { // statusInter comes from Inter API
                    novoStatus = STATUS_TRANSACAO_SUCESSO;
                } else if (["REJEITADO", "CANCELADO", "DEVOLVIDO", "FALHA"].includes(statusInter)) {
                    novoStatus = STATUS_TRANSACAO_ERRO;
                }

                if (novoStatus !== STATUS_TRANSACAO_PROCESSANDO) {
                    // 3. Atualizar Transação
                    await supabaseAdmin
                        .from("transacoes_repasse")
                        .update({ 
                            status: novoStatus, 
                            data_conclusao: new Date(),
                            // Se tiver campo de erro/motivo na tabela transacoes_repasse, atualizar aqui
                        })
                        .eq("id", transacao.id);

                    // 4. Atualizar status na Cobrança Original (para manter sincronia)
                    if (transacao.cobranca_id) {
                        const statusCobranca = novoStatus === STATUS_TRANSACAO_SUCESSO ? STATUS_REPASSE_REPASSADO : STATUS_REPASSE_FALHA;
                        await supabaseAdmin
                            .from("cobrancas")
                            .update({ status_repasse: statusCobranca })
                            .eq("id", transacao.cobranca_id);
                    }

                    if (novoStatus === STATUS_TRANSACAO_SUCESSO) {
                        logger.info({ id: transacao.id, valor: transacao.valor_repassado }, "Repasse confirmado com sucesso!");
                    } else {
                        logger.warn({ id: transacao.id, statusInter, usuarioId: transacao.usuario_id }, "Repasse FALHOU. Invalidando chave PIX e notificando motorista.");
                        
                        // 1. Invalidar Chave PIX do Motorista (Segurança)
                        await supabaseAdmin
                            .from("usuarios")
                            .update({ 
                                chave_pix_validada: false, 
                                status_chave_pix: STATUS_CHAVE_PIX_INVALIDADA 
                            })
                            .eq("id", transacao.usuario_id);

                        // 2. Notificar Motorista
                        try {
                            // Buscar dados para notificação
                            const { data: usuario } = await supabaseAdmin
                                .from("usuarios")
                                .select("nome, telefone")
                                .eq("id", transacao.usuario_id)
                                .single();

                            if (usuario?.telefone) {
                                notificationService.notifyDriver(usuario.telefone, DRIVER_EVENT_REPASSE_FAILED, {
                                    nomeMotorista: usuario.nome,
                                    valor: transacao.valor_repassado,
                                    nomePlano: "Repasse", // Opcional
                                    dataVencimento: new Date().toISOString()
                                } as any);
                            }
                        } catch (notifErr) {
                            logger.error({ notifErr }, "Erro ao enviar notificacao de falha repasse");
                        }
                    }
                }

            } catch (err: any) {
                logger.error({ error: err.message, id: transacao.id }, "Erro ao verificar status de repasse");
            }
        }
    }
};
