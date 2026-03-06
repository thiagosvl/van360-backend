import { Job, Worker } from 'bullmq';
import { logger } from '../config/logger.js';
import { redisConfig } from '../config/redis.js';
import { PayoutJobData, QUEUE_NAME_PAYOUT } from '../queues/payout.queue.js';
import { paymentService } from '../services/payment.service.js';
import { repasseFsmService } from '../services/repasse-fsm.service.js';
import { RepasseState } from '../types/enums.js';

/**
 * Worker responsável por realizar transferências bancárias (Repasses).
 * Usa a FSM para todas as transições de estado.
 */
export const payoutWorker = new Worker<PayoutJobData>(
    QUEUE_NAME_PAYOUT,
    async (job: Job<PayoutJobData>) => {
        const { cobrancaId, motoristaId, valorRepasse, repasseId } = job.data;
        logger.info({ jobId: job.id, cobrancaId, motoristaId, valorRepasse, repasseId }, "[PayoutWorker] 🚀 Iniciando processamento de repasse");

        try {
            // 1. Transicionar para DECODIFICANDO (worker pegou da fila)
            try {
              await repasseFsmService.transicionar(repasseId, RepasseState.DECODIFICANDO, {
                  ator: "payout_worker",
                  motivo: "Worker iniciou processamento",
                  metadata: { 
                    jobId: job.id, 
                    attempts: job.attemptsMade + 1,
                    motoristaId,
                    cobrancaId
                  }
              });
            } catch (fsmErr: any) {
              // Se já estiver decodificando ou em estado posterior (ex: crashou depois do submit), ignoramos o erro de transição
              if (fsmErr.message.includes("TRANSICAO_INVALIDA") || fsmErr.message === "CONFLITO_CONCORRENCIA") {
                  logger.info({ repasseId }, "[PayoutWorker] Repasse já em processamento ou transicionado. Continuando...");
              } else {
                  throw fsmErr;
              }
            }

            // 2. Verificar se já possuímos o ID do gateway (idempotência)
            const { data: repasseAtual, error: fetchErr } = await (await import('../config/supabase.js')).supabaseAdmin
                .from("repasses")
                .select("gateway_group_id, tentativa")
                .eq("id", repasseId)
                .single();

            if (fetchErr) throw fetchErr;

            let groupId = repasseAtual?.gateway_group_id;

            if (!groupId) {
                // 3. Buscar dados bancários do motorista (Chave PIX)
                const { data: usuario, error: userError } = await (await import('../config/supabase.js')).supabaseAdmin
                    .from("usuarios")
                    .select("chave_pix, nome")
                    .eq("id", motoristaId)
                    .single();
                
                if (userError || !usuario) throw new Error("Motorista não encontrado");
                if (!usuario.chave_pix) throw new Error("Chave PIX do motorista não encontrada");

                logger.info({ cobrancaId, motoristaId, nome: usuario.nome, jobId: job.id }, "[PayoutWorker] ✅ Dados do motorista obtidos. Preparando PIX.");
                
                const valorNormalizado = Number(Number(valorRepasse).toFixed(2));
                
                // IDEMPOTÊNCIA STABLE: Usamos repasseId + tentativa.
                // Se o worker crashar e o BullMQ retentar o MESMO job, a chave é a mesma.
                // Se a FSM transicionar de volta para CRIADO (novo ciclo), a tentativa aumenta e a chave muda.
                const idempotencyKey = `${repasseId}-${repasseAtual.tentativa}`;
                
                const provider = paymentService.getProvider();
                const pixResponse = await provider.realizarTransferencia({
                    valor: valorNormalizado,
                    chaveDestino: usuario.chave_pix,
                    descricao: `Repasse Van360 - Cobranca ${cobrancaId}`,
                    xIdIdempotente: idempotencyKey
                });

                groupId = pixResponse.endToEndId;

                if (groupId) {
                    logger.info({ jobId: job.id, cobrancaId, groupId }, "✅ [PayoutWorker] Repasse enviado para o gateway");
                    await repasseFsmService.atualizarGatewayInfo(repasseId, { gateway_group_id: groupId });
                }
            }

            if (groupId) {
                const provider = paymentService.getProvider();
                logger.info({ groupId, jobId: job.id, repasseId }, "[PayoutWorker] ⏳ Iniciando Smart Poll para submissão imediata...");

                for (let i = 0; i < 8; i++) { // Tenta por ~40 segundos (8 x 5s)
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    
                    try {
                        const statusResp = await provider.consultarTransferencia(groupId);
                        const rawStatus = statusResp.rawStatus;
                        
                        logger.debug({ groupId, attempt: i + 1, rawStatus }, "[PayoutWorker] Polling status C6");

                        if (rawStatus === 'READ_DATA') {
                            logger.info({ groupId, repasseId }, "🚀 [PayoutWorker] Item decodificado! Transicionando e submetendo...");
                            
                            // Primeiro transicionamos para DECODIFICADO (exigência da FSM)
                            await repasseFsmService.transicionar(repasseId, RepasseState.DECODIFICADO, {
                                ator: "payout_worker_smart_poll",
                                motivo: "C6 retornou READ_DATA durante polling",
                                metadata: { 
                                  rawStatus, 
                                  groupId,
                                  itemId: statusResp.itemId // Se disponível no statusResp
                                }
                            });

                            // Pegar o itemId se ainda não tivermos (C6 expõe em listarItensGrupo)
                            let itemId = statusResp.itemId;
                            const anyProvider = provider as any;
                            if (!itemId && anyProvider.listarItensGrupo) {
                              try {
                                const itemsData = await anyProvider.listarItensGrupo(groupId);
                                if (itemsData?.items?.length > 0) {
                                  itemId = itemsData.items[0].id;
                                }
                              } catch (e) {
                                logger.warn({ groupId }, "Erro ao buscar itemId em smart poll");
                              }
                            }

                            if (itemId) {
                              await repasseFsmService.atualizarGatewayInfo(repasseId, { gateway_item_id: itemId });
                            }

                            // Agora submetemos ao banco para aparecer no App
                            await provider.submeterTransferencia(groupId);
                            
                            // E transicionamos para SUBMETIDO
                            await repasseFsmService.transicionar(repasseId, RepasseState.SUBMETIDO, {
                                ator: "payout_worker_smart_poll",
                                motivo: "Submissão imediata após decodificação rápida (Smart Poll)",
                                metadata: { groupId, itemId }
                            });
                            return; // Sucesso total, encerra o worker
                        }

                        if (rawStatus === 'DECODE_ERROR' || rawStatus === 'ERROR') {
                            logger.error({ groupId, rawStatus, repasseId }, "❌ [PayoutWorker] Erro na decodificação durante Smart Poll");
                            await repasseFsmService.transicionar(repasseId, RepasseState.ERRO_DECODIFICACAO, {
                                ator: "payout_worker_smart_poll",
                                motivo: `Erro no banco durante decodificação: ${statusResp.error_message || rawStatus}`
                            });
                            return; // Encerra com erro de negócio
                        }
                    } catch (pollError: any) {
                        logger.warn({ groupId, error: pollError.message, repasseId }, "[PayoutWorker] Erro durante Smart Poll. Deixando para o monitor job.");
                        break; // Deixa o monitor job assumir depois
                    }
                }

                logger.info({ groupId, repasseId }, "[PayoutWorker] Smart Poll finalizado sem decodificação imediata. O Job Monitor assumirá a submissão.");
            }

        } catch (error: any) {
            const errorMsg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
            logger.error({ 
                jobId: job.id, 
                cobrancaId,
                repasseId,
                error: errorMsg,
                attempt: job.attemptsMade + 1
            }, "❌ [PayoutWorker] Falha no processamento do repasse");

            try {
                await repasseFsmService.transicionar(repasseId, RepasseState.ERRO_DECODIFICACAO, {
                    ator: "payout_worker",
                    motivo: error.message,
                    metadata: {
                        erro_codigo: error.response?.status?.toString(),
                        rawError: errorMsg,
                        attempt: job.attemptsMade + 1,
                    },
                });
            } catch (fsmError: any) {
                logger.error({ repasseId, fsmError }, "[PayoutWorker] Erro ao transicionar FSM para ERRO_DECODIFICACAO");
            }

            if (error.message.includes("Chave PIX") || error.message.includes("Motorista não encontrado")) {
                 logger.warn({ motoristaId, error: error.message }, "[PayoutWorker] Abortando retentativas devido a erro de cadastro");
                 return;
            }

            throw error; 
        }
    },
    {
        connection: redisConfig,
        concurrency: 2,
        limiter: {
             max: 10, 
             duration: 60000
        }
    }
);
