import { Job, Worker } from 'bullmq';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { redisConfig } from '../config/redis.js';
import { supabaseAdmin } from '../config/supabase.js';
import { ContractJobData, QUEUE_NAME_CONTRACT } from '../queues/contract.queue.js';
import { addToWhatsappQueue } from '../queues/whatsapp.queue.js';
import { ContratoProvider } from '../types/enums.js';
import { getFirstName } from '../utils/format.js';

/**
 * Worker responsável por processar a geração de PDFs de contrato.
 */
export const contractWorker = new Worker<ContractJobData>(
    QUEUE_NAME_CONTRACT,
    async (job: Job<ContractJobData>) => {
        const { contratoId, providerName, dadosContrato, passageiro, tokenAcesso } = job.data;
        
        logger.info({ jobId: job.id, contratoId }, "[Worker] Iniciando processamento de contrato...");

        try {
            // 1. Import dinâmico do serviço para evitar circular dependency
            const { contractService } = await import('../services/contract.service.js');
            
            // 2. Gerar PDF usando o provider correspondente
            // Nota: O provider deve ser obtido via service para garantir consistência
            const provider = (contractService as any).getProvider(providerName);
            const response = await provider.gerarContrato({
                contratoId,
                dadosContrato,
            });

            // 3. Atualizar contrato no Supabase com a URL da minuta
            const { error: updateError } = await supabaseAdmin
                .from('contratos')
                .update({
                    minuta_url: response.documentUrl,
                    provider_document_id: response.providerDocumentId,
                    provider_link_assinatura: response.providerSignatureLink,
                })
                .eq('id', contratoId);

            if (updateError) throw updateError;

            logger.info({ jobId: job.id, contratoId }, "[Worker] Contrato atualizado com minuta URL.");

            // 4. Enviar para a fila de WhatsApp se houver telefone
            if (passageiro.telefone_responsavel) {
                const linkAssinatura = providerName === ContratoProvider.INHOUSE 
                    ? `${env.FRONTEND_URL}/assinar/${tokenAcesso}`
                    : response.providerSignatureLink;

                const nomeResponsavel = getFirstName(passageiro.nome_responsavel);
                const mensagem = `Oi *${nomeResponsavel}*! Tudo bem? 👋\n\n` +
                  `Estou enviando o contrato de transporte escolar do(a) passageiro(a) *${passageiro.nome}* para assinatura digital.\n\n` +
                  `👉 Acesse o link abaixo para visualizar e assinar:\n\n` +
                  `${linkAssinatura}\n\n` +
                  `O contrato terá validade após a assinatura de ambas as partes.\n\n` +
                  `🤝 Fico à disposição em caso de dúvidas.`;

                await addToWhatsappQueue({
                    phone: passageiro.telefone_responsavel,
                    message: mensagem,
                    context: "CONTRACT_GENERATION",
                    userId: dadosContrato.usuarioId // Se disponível nos dados
                });

                logger.info({ jobId: job.id, phone: passageiro.telefone_responsavel }, "[Worker] Notificação de contrato enfileirada.");
            }

            return { success: true, documentUrl: response.documentUrl };

        } catch (error: any) {
            logger.error({ jobId: job.id, error: error.message }, "[Worker] Contract Job Failed");
            throw error;
        }
    },
    {
        connection: redisConfig,
        concurrency: 2, // Limite de 2 gerações simultâneas para poupar CPU/RAM
        limiter: {
             max: 10, 
             duration: 60000 
        }
    }
);
