import { logger } from "../../config/logger.js";
import { getNowBR } from "../../utils/date.utils.js";
import * as usuarioService from "../usuario.service.js";
import { addToBirthdayQueue } from "../../queues/birthday.queue.js";

export const birthdayReminderJob = {
  async runWeekly() {
    logger.info("[BirthdayReminder] Iniciando job semanal (enfileirando tarefas)...");
    
    // Buscar todos os usuários ativos (motoristas) que possuem celular cadastrado
    let usuarios = [];
    try {
        usuarios = await usuarioService.listarMotoristasParaLembreteAniversario();
    } catch (error) {
        logger.error({ error }, "[BirthdayReminder] Erro ao buscar usuários ativos");
        return;
    }

    if (!usuarios?.length) {
        logger.info("[BirthdayReminder] Nenhum usuário encontrado para processar.");
        return;
    }

    const hoje = getNowBR();
    const mesAtual = hoje.getMonth() + 1; // 1 a 12
    const diaAtual = hoje.getDate();

    let queuedCount = 0;

    // Enfileirar tarefas para o worker processar assincronamente
    for (const usuario of usuarios) {
      if (!usuario.telefone) continue;

      try {
        await addToBirthdayQueue({
            motoristaId: usuario.id,
            telefone: usuario.telefone,
            nomeMotorista: usuario.nome,
            mesAtual,
            diaAtual
        });
        queuedCount++;
      } catch (err: any) {
        logger.error({ err: err.message, usuarioId: usuario.id }, "[BirthdayReminder] Erro ao enfileirar lembrete para usuário");
      }
    }

    logger.info({ queuedCount }, "[BirthdayReminder] Job semanal concluído. Tarefas enviadas para a fila.");
  }
};
