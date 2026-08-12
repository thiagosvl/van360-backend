import { NotificationChannelEnum } from '../types/enums.js';
import { Job, Worker } from 'bullmq';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { redisConfig } from '../config/redis.js';
import { contractRepository } from '../repositories/contract.repository.js';
import { ContractJobData, QUEUE_NAME_CONTRACT } from '../queues/contract.queue.js';
import { historicoService } from '../services/historico.service.js';
import { AtividadeAcao, AtividadeEntidadeTipo, ContratoProvider } from '../types/enums.js';

/**
 * Worker responsável por processar a geração de PDFs de contrato.
 */
export const contractWorker = new Worker<ContractJobData>(
    QUEUE_NAME_CONTRACT,
    async (job: Job<ContractJobData>) => {
        const { contratoId, usuarioId, providerName, dadosContrato, passageiro, tokenAcesso } = job.data;

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
            await contractRepository.updateStatus(contratoId, {
                minuta_url: response.documentUrl,
                provider_document_id: response.providerDocumentId,
                provider_link_assinatura: response.providerSignatureLink,
            });

            logger.info({ jobId: job.id, contratoId }, "[Worker] Contrato atualizado com minuta URL.");

            // 4. Notificar Responsável via NotificationService
            const emailResponsavel = (passageiro as Record<string, unknown>).email_responsavel as string | undefined;
            if (passageiro.telefone_responsavel || emailResponsavel) {
                const linkAssinatura = providerName === ContratoProvider.INHOUSE
                    ? `${env.FRONTEND_URL}/assinar/${tokenAcesso}`
                    : response.providerSignatureLink;

                const { notificationService } = await import('../services/notifications/notification.service.js');
                const { EVENTO_PASSAGEIRO_CONTRATO_DISPONIVEL } = await import('../config/constants.js');
                const { getDriverDisplayName } = await import('../utils/format.js');

                await notificationService.notifyPassenger(
                    passageiro.telefone_responsavel,
                    EVENTO_PASSAGEIRO_CONTRATO_DISPONIVEL,
                    {
                        nomeResponsavel: passageiro.nome_responsavel,
                        nomePassageiro: passageiro.nome,
                        nomeMotorista: getDriverDisplayName({
                            cpfcnpj: dadosContrato.cpfCnpjCondutor,
                            apelido: dadosContrato.apelidoCondutor,
                            razao_social: dadosContrato.nomeCondutor,
                            nome: dadosContrato.nomeCondutor
                        }),
                        apelidoMotorista: dadosContrato.apelidoCondutor,
                        linkAssinatura,
                        email: (passageiro as Record<string, unknown>).email_responsavel as string | undefined,
                        usuarioId: usuarioId
                    },
                    { channels: [NotificationChannelEnum.WABA, NotificationChannelEnum.RESEND, NotificationChannelEnum.FIREBASE], usuarioId: usuarioId, email: (passageiro as Record<string, unknown>).email_responsavel as string | undefined }
                );

                logger.info({ jobId: job.id, phone: passageiro.telefone_responsavel }, "[Worker] Notificação de contrato processada via NotificationService.");
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
