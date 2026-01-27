import { Job, Worker } from 'bullmq';
import { logger } from '../config/logger.js';
import { redisConfig } from '../config/redis.js';
import { supabaseAdmin } from '../config/supabase.js';
import { PayoutJobData, QUEUE_NAME_PAYOUT } from '../queues/payout.queue.js';
import { interService } from '../services/inter.service.js';
import { RepasseStatus, TransactionStatus } from '../types/enums.js';

/**
 * Worker responsável por realizar transferências bancárias (Repasses).
 */
export const payoutWorker = new Worker<PayoutJobData>(
    QUEUE_NAME_PAYOUT,
    async (job: Job<PayoutJobData>) => {
        const { cobrancaId, motoristaId, valorRepasse, transacaoId } = job.data;
        logger.info({ jobId: job.id, cobrancaId }, "[Worker] Iniciando processamento de repasse...");

        try {
            // 1. Marcar como "Processando" no banco (se ainda não estiver)
            // (Isso dá feedback visual caso o job demore)
            await supabaseAdmin.from("cobrancas")
                .update({ status_repasse: RepasseStatus.PROCESSANDO })
                .eq("id", cobrancaId);

            // 2. Chamar Service de Repasse (Reutiliza lógica existente ou chama Inter direto)
            // Vamos chamar a lógica do Inter Service direta para ter controle do erro aqui
            
            // Buscar dados bancarios do motorista (Chave PIX)
            const { data: usuario } = await supabaseAdmin.from("usuarios").select("chave_pix").eq("id", motoristaId).single();
            if (!usuario?.chave_pix) {
                throw new Error("Chave PIX do motorista não encontrada");
            }

            // Realizar Transferência
             // Nota: Estamos re-implementando parte do cobrancaService.iniciarRepasse para ter controle granular
             // Mas idealmente o worker chamaria o serviço se ele fosse refatorado para ser "Executar Repasse".
             // Vou chamar o interService direto aqui para simplificar a migração.
             
             logger.debug({ cobrancaId, chavePix: usuario.chave_pix }, "[Worker] Enviando PIX para motorista...");
             
             const pixResponse = await interService.realizarPixRepasse(supabaseAdmin, {
                valor: valorRepasse,
                chaveDestino: usuario.chave_pix, // Note: The prop name in PagamentoPixParams is chaveDestino, not chavePix
                descricao: `Repasse Van360 - Cobranca ${cobrancaId}`,
                xIdIdempotente: `PAYOUT-${cobrancaId}-${Date.now()}` // Adding required Idempotency Key
             });

             // 3. Sucesso! Atualizar Banco
             if (pixResponse.endToEndId) {
                await supabaseAdmin.from("cobrancas")
                    .update({ status_repasse: RepasseStatus.REPASSADO })
                    .eq("id", cobrancaId);

                // Se tiver transacaoId (do registro financeiro da plataforma), atualiza tbm
                if (transacaoId) {
                    await supabaseAdmin.from("transacoes_repasse")
                        .update({ 
                            status: TransactionStatus.SUCESSO, 
                            txid_pix_repasse: pixResponse.endToEndId, 
                            data_conclusao: new Date() 
                        })
                        .eq("id", transacaoId);
                }

                logger.info({ jobId: job.id, cobrancaId, e2e: pixResponse.endToEndId }, "[Worker] Repasse realizado com sucesso");
             }

        } catch (error: any) {
            logger.error({ jobId: job.id, error: error.message }, "[Worker] Payout Job Failed");
            
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

            // Se for erro de lógica (sem chave pix), parar retry
            if (error.message.includes("Chave PIX")) {
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
