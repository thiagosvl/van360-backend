import { DRIVER_EVENT_REPASSE_FAILED, DRIVER_EVENT_REPASSE_SUCCESS } from "../../config/constants.js";
import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";
import { addToPayoutQueue } from "../../queues/payout.queue.js";
import { PaymentGateway, PixKeyStatus, ProviderTransferStatus, RepasseState } from "../../types/enums.js";
import { notificationService } from "../notifications/notification.service.js";
import { paymentService } from "../payment.service.js";
import { repasseFsmService } from "../repasse-fsm.service.js";

export const repasseMonitorJob = {
    async run() {
        logger.info("Iniciando Monitoramento de Repasses (FSM)");

        const estadosMonitorar = [
            RepasseState.DECODIFICANDO,
            RepasseState.DECODIFICADO,
            RepasseState.SUBMETIDO,
            RepasseState.AGUARDANDO_APROVACAO,
            RepasseState.EM_LIQUIDACAO,
        ];

        const pendentes = await repasseFsmService.buscarPorEstados(estadosMonitorar);

        if (!pendentes || pendentes.length === 0) {
            logger.info("Nenhum repasse pendente de monitoramento.");
            return;
        }

        logger.info({ count: pendentes.length }, "Verificando status de repasses no gateway...");

        for (const repasse of pendentes) {
            try {
                if (!repasse.gateway_group_id) {
                    const createdAt = new Date(repasse.created_at);
                    const diffHours = Math.abs(new Date().getTime() - createdAt.getTime()) / 3600000;

                    if (diffHours > 1 && repasse.estado === RepasseState.DECODIFICANDO) {
                        logger.warn({ id: repasse.id, diffHours }, "[Monitor] Repasse sem gateway_group_id por >1h (Crash). Revertendo para CRIADO.");

                        await repasseFsmService.transicionar(repasse.id, RepasseState.CRIADO, {
                            ator: "repasse_monitor",
                            motivo: "Auto-recuperação: gateway_group_id ausente após 1h (possível crash)",
                        });

                        if (repasse.tentativa < repasse.max_tentativas) {
                            await addToPayoutQueue({
                                cobrancaId: repasse.cobranca_id,
                                repasseId: repasse.id,
                                valorRepasse: Number(repasse.valor),
                                motoristaId: repasse.usuario_id,
                            });
                        }
                    } else {
                        logger.debug({ id: repasse.id }, "[Monitor] Repasse recente sem gateway_group_id. Aguardando worker.");
                    }
                    continue;
                }

                const provider = paymentService.getProvider();
                const pixInfo = await provider.consultarTransferencia(repasse.gateway_group_id);
                const providerStatus = pixInfo.status as ProviderTransferStatus;

                if (pixInfo.rawStatus) {
                    await repasseFsmService.atualizarGatewayInfo(repasse.id, {
                        gateway_raw_status: pixInfo.rawStatus,
                    });
                }

                if (paymentService.getActiveGateway() === PaymentGateway.C6 && pixInfo.rawStatus === "READ_DATA") {
                    logger.info({ id: repasse.id, groupId: repasse.gateway_group_id }, "[Monitor] C6 READ_DATA. Submetendo grupo...");

                    if (repasse.estado === RepasseState.DECODIFICANDO) {
                        await repasseFsmService.transicionar(repasse.id, RepasseState.DECODIFICADO, {
                            ator: "repasse_monitor",
                            motivo: "C6 retornou READ_DATA (DICT validou chave PIX)",
                            metadata: { rawStatus: pixInfo.rawStatus, groupId: repasse.gateway_group_id },
                        });
                    }

                    await provider.submeterTransferencia(repasse.gateway_group_id);

                    // Buscar itemId para o registro de repasses (C6 específico)
                    let itemId = repasse.gateway_item_id;
                    const anyProvider = provider as any;
                    if (!itemId && anyProvider.listarItensGrupo) {
                        try {
                            const itemsData = await anyProvider.listarItensGrupo(repasse.gateway_group_id);
                            if (itemsData?.items?.length > 0) {
                                itemId = itemsData.items[0].id;
                                await repasseFsmService.atualizarGatewayInfo(repasse.id, { gateway_item_id: itemId });
                            }
                        } catch (e) { 
                            logger.warn({ id: repasse.id }, "Erro ao extrair itemId no monitor"); 
                        }
                    }

                    await repasseFsmService.transicionar(repasse.id, RepasseState.SUBMETIDO, {
                        ator: "repasse_monitor",
                        motivo: "/submit enviado com sucesso ao C6",
                        metadata: { groupId: repasse.gateway_group_id, itemId }
                    });

                    logger.info({ id: repasse.id }, "[Monitor] Grupo submetido. Próxima execução verificará novo status.");
                    continue;
                }

                let novoEstado: RepasseState | null = null;
                let motivo = "";

                if (providerStatus === ProviderTransferStatus.PAGO || providerStatus === ProviderTransferStatus.REALIZADO) {
                    novoEstado = RepasseState.LIQUIDADO;
                    motivo = `Gateway confirmou: ${pixInfo.rawStatus || providerStatus}`;
                } else if ([ProviderTransferStatus.REJEITADO, ProviderTransferStatus.DEVOLVIDO, ProviderTransferStatus.FALHA].includes(providerStatus)) {
                    novoEstado = RepasseState.ERRO_TRANSFERENCIA;
                    motivo = `Gateway rejeitou: ${pixInfo.rawStatus || providerStatus}`;
                } else if (providerStatus === ProviderTransferStatus.PROCESSING_BANK) {
                    if (repasse.estado === RepasseState.SUBMETIDO) {
                        novoEstado = RepasseState.AGUARDANDO_APROVACAO;
                        motivo = `C6 retornou ${pixInfo.rawStatus} (aguardando aprovação humana)`;
                    } else if (repasse.estado === RepasseState.AGUARDANDO_APROVACAO) {
                        novoEstado = RepasseState.EM_LIQUIDACAO;
                        motivo = `C6 em processamento bancário (pós-aprovação)`;
                    }
                } else if (providerStatus === ProviderTransferStatus.CANCELADO) {
                    novoEstado = RepasseState.EXPIRADO;
                    motivo = "Gateway cancelou (provável expiração do prazo de aprovação 23h15)";
                } else if (providerStatus === ProviderTransferStatus.WAITING_APPROVAL) {
                    logger.debug({ id: repasse.id, status: providerStatus }, "[Monitor] Ainda aguardando aprovação no gateway.");
                    continue;
                }

                if (novoEstado && novoEstado !== repasse.estado) {
                    await repasseFsmService.transicionar(repasse.id, novoEstado, {
                        ator: "repasse_monitor",
                        motivo,
                        metadata: { providerStatus, rawStatus: pixInfo.rawStatus, groupId: repasse.gateway_group_id },
                    });

                    if (novoEstado === RepasseState.LIQUIDADO) {
                        logger.info({ id: repasse.id, valor: repasse.valor }, "✅ Repasse LIQUIDADO com sucesso!");
                        try {
                            const { data: usuario } = await supabaseAdmin.from("usuarios").select("nome, telefone").eq("id", repasse.usuario_id).single();
                            if (usuario?.telefone) {
                                notificationService.notifyDriver(usuario.telefone, DRIVER_EVENT_REPASSE_SUCCESS, {
                                    nomeMotorista: usuario.nome,
                                    valor: repasse.valor,
                                    dataVencimento: new Date().toISOString()
                                } as any);
                            }
                        } catch (e) { logger.error(e, "Erro ao notificar sucesso repasse"); }
                    } else if (novoEstado === RepasseState.ERRO_TRANSFERENCIA) {
                        logger.warn({ id: repasse.id, providerStatus }, "❌ Repasse FALHOU no gateway.");
                        await supabaseAdmin.from("usuarios").update({ status_chave_pix: PixKeyStatus.INVALIDADA_POS_FALHA }).eq("id", repasse.usuario_id);
                        try {
                            const { data: usuario } = await supabaseAdmin.from("usuarios").select("nome, telefone").eq("id", repasse.usuario_id).single();
                            if (usuario?.telefone) {
                                notificationService.notifyDriver(usuario.telefone, DRIVER_EVENT_REPASSE_FAILED, {
                                    nomeMotorista: usuario.nome,
                                    valor: repasse.valor,
                                    dataVencimento: new Date().toISOString()
                                } as any);
                            }
                        } catch (notifErr) {
                            logger.error({ notifErr }, "Erro ao notificar falha repasse");
                        }
                    } else if (novoEstado === RepasseState.EXPIRADO) {
                        logger.info({ id: repasse.id }, "⏰ Repasse EXPIRADO pelo gateway. Será reenfileirado pelo retry job.");
                    }
                }
            } catch (err: any) {
                logger.error({ error: err.message, id: repasse.id }, "Erro ao verificar status de repasse");
            }
        }
    }
};
