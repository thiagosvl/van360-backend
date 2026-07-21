import { Job, Worker } from 'bullmq';
import { logger } from '../config/logger.js';
import { redisConfig } from '../config/redis.js';
import { BirthdayJobData, QUEUE_NAME_BIRTHDAY } from '../queues/birthday.queue.js';
import { passageiroService } from '../services/passageiro.service.js';
import { notificationService } from '../services/notifications/notification.service.js';
import { EVENTO_MOTORISTA_ANIVERSARIANTES_SEMANA } from '../config/constants.js';
import { formatarPlacaExibicao } from '../utils/placa.utils.js';

export const birthdayWorker = new Worker<BirthdayJobData>(
    QUEUE_NAME_BIRTHDAY,
    async (job: Job<BirthdayJobData>) => {
        const { motoristaId, telefone, nomeMotorista, mesAtual, diaAtual } = job.data;
        logger.info({ jobId: job.id, motoristaId }, "[Worker] Verificando aniversários da semana...");

        try {
            const { semanas, passageirosSemData, totalPassageiros } = await passageiroService.listarAniversariantesDoMes(motoristaId, mesAtual);

            if (totalPassageiros === 0) {
                logger.info({ motoristaId }, "[Worker] Usuário sem passageiros cadastrados, pulando lembrete de aniversário...");
                return { sent: false, reason: "No passengers" };
            }

            const semanaAtualNoMes = Math.ceil(diaAtual / 7);
            const semanaGarantida = semanaAtualNoMes > 5 ? 5 : semanaAtualNoMes;

            const dadosDaSemana = semanas.find(s => s.semana === semanaGarantida);
            const aniversariantesList = dadosDaSemana?.aniversariantes || [];

            await notificationService.notifyDriver(telefone, EVENTO_MOTORISTA_ANIVERSARIANTES_SEMANA, {
                nomeMotorista,
                aniversariantesList: aniversariantesList.map((p: any) => ({
                    veiculo: formatarPlacaExibicao(p.veiculo.placa),
                    escola: p.escola.nome,
                    nome: p.nome,
                    dia: p.dia,
                    mes: mesAtual
                })),
                passageirosSemData
            }, { channels: ['WHATSAPP'] });

            logger.info({ motoristaId, celular: telefone }, "[Worker] Lembrete enviado com sucesso.");
            return { sent: true };

        } catch (error: any) {
            logger.error({ jobId: job.id, motoristaId, error: error.message }, "[Worker] Falha ao processar aniversário no worker");
            throw error;
        }
    },
    {
        connection: redisConfig,
        concurrency: 5,
        limiter: {
            max: 20,
            duration: 10000
        }
    }
);
