import { Job, Worker } from 'bullmq';
import { randomUUID } from 'crypto';
import { logger } from '../config/logger.js';
import { redisConfig } from '../config/redis.js';
import { supabaseAdmin } from '../config/supabase.js';
import { PayoutJobData, QUEUE_NAME_PAYOUT } from '../queues/payout.queue.js';
import { paymentService } from '../services/payment.service.js';
import { RepasseStatus, TransactionStatus } from '../types/enums.js';

/**
 * Worker responsável por realizar transferências bancárias (Repasses).
 */
export const payoutWorker = new Worker<PayoutJobData>(
    QUEUE_NAME_PAYOUT,
    async (job: Job<PayoutJobData>) => {
        const { cobrancaId, motoristaId, valorRepasse, transacaoId } = job.data;
        logger.info({ jobId: job.id, cobrancaId, motoristaId, valorRepasse, transacaoId }, "[PayoutWorker] 🚀 Iniciando processamento de repasse");

        try {
            // 1. Marcar como "Processando" no banco
            logger.debug({ cobrancaId, jobId: job.id }, "[PayoutWorker] Atualizando status_repasse para PROCESSANDO");
            await supabaseAdmin.from("cobrancas")
                .update({ status_repasse: RepasseStatus.PROCESSANDO })
                .eq("id", cobrancaId);

            // 2. Chamar Service de Repasse
            // Buscar dados bancarios do motorista (Chave PIX)
            const { data: usuario, error: userError } = await supabaseAdmin.from("usuarios").select("chave_pix, nome").eq("id", motoristaId).single();
            
            if (userError || !usuario) {
                logger.error({ userError, motoristaId, jobId: job.id }, "[PayoutWorker] Erro ao buscar dados do motorista");
                throw new Error("Motorista não encontrado");
            }

            if (!usuario.chave_pix) {
                logger.warn({ motoristaId, jobId: job.id }, "[PayoutWorker] Chave PIX ausente");
                throw new Error("Chave PIX do motorista não encontrada");
            }

            logger.info({ cobrancaId, motoristaId, nome: usuario.nome, jobId: job.id }, "[PayoutWorker] ✅ Dados do motorista obtidos. Preparando PIX.");
             
            const valorNormalizado = Number(Number(valorRepasse).toFixed(2));
            const idempotencyKey = randomUUID();
            
            const provider = paymentService.getProvider();
            const pixResponse = await provider.realizarTransferencia({
                valor: valorNormalizado,
                chaveDestino: usuario.chave_pix,
                descricao: `Repasse Van360 - Cobranca ${cobrancaId}`,
                xIdIdempotente: idempotencyKey
            });

            // 3. Sucesso! Atualizar Banco
            if (pixResponse.endToEndId) {
                logger.info({ 
                    jobId: job.id, 
                    cobrancaId, 
                    e2e: pixResponse.endToEndId,
                    status: pixResponse.status 
                }, "✅ [PayoutWorker] Repasse realizado com sucesso via Provedor");

                await supabaseAdmin.from("cobrancas")
                    .update({ status_repasse: RepasseStatus.REPASSADO })
                    .eq("id", cobrancaId);

                // Se tiver transacaoId (do registro financeiro da plataforma), atualiza tbm
                if (transacaoId) {
                    await supabaseAdmin.from("transacoes_repasse")
                        .update({ 
                            status: TransactionStatus.SUCESSO, 
                            gateway_txid: pixResponse.endToEndId, 
                            data_conclusao: new Date(),
                            mensagem_erro: null 
                        })
                        .eq("id", transacaoId);
                    
                    logger.debug({ transacaoId, e2e: pixResponse.endToEndId }, "[PayoutWorker] Registro financeiro atualizado");
                }
            }

        } catch (error: any) {
            const errorMsg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
            logger.error({ 
                jobId: job.id, 
                cobrancaId,
                error: errorMsg,
                attempt: job.attemptsMade + 1
            }, "❌ [PayoutWorker] Falha no processamento do repasse");
            
            // Persistir erro no banco para o motorista ver
            if (transacaoId) {
                await supabaseAdmin.from("transacoes_repasse")
                    .update({ 
                        status: TransactionStatus.ERRO, 
                        mensagem_erro: error.message 
                    })
                    .eq("id", transacaoId);
            }

            // Marcar cobrança como falha
            await supabaseAdmin.from("cobrancas").update({ status_repasse: RepasseStatus.FALHA }).eq("id", cobrancaId);

            // Se for erro de lógica (sem chave pix ou usuário não encontrado), parar retry configurando o job como falha definitiva
            if (error.message.includes("Chave PIX") || error.message.includes("Motorista não encontrado")) {
                 logger.warn({ motoristaId, error: error.message }, "[PayoutWorker] Abortando retentativas devido a erro de cadastro");
                 return;
            }

            throw error; // Lança para o BullMQ fazer retry (erro de banco/rede)
        }
    },
    {
        connection: redisConfig,
        concurrency: 2, // Transferências são críticas, melhor ir devagar
        limiter: {
             max: 10, 
             duration: 60000 // Max 10 por minuto (Segurança)
        }
    }
);
