import { logger } from "../../config/logger.js";
import { passageiroService } from "../passageiro.service.js";
import { notificationService } from "../notifications/notification.service.js";
import { EVENTO_MOTORISTA_ANIVERSARIANTES_SEMANA } from "../../config/constants.js";
import { getNowBR } from "../../utils/date.utils.js";
import * as usuarioService from "../usuario.service.js";
import { formatarPlacaExibicao } from "../../utils/placa.utils.js";

export const birthdayReminderJob = {
  async runWeekly() {
    logger.info("[BirthdayReminder] Iniciando job semanal...");
    
    // Buscar todos os usuários ativos (motoristas) que possuem celular cadastrado via Service (Thin Controller, Fat Service)
    let usuarios = [];
    try {
        usuarios = await usuarioService.listarMotoristasParaLembreteAniversario();
    } catch (error) {
        logger.error({ error }, "[BirthdayReminder] Erro ao buscar usuários ativos");
        return;
    }

    const hoje = getNowBR();
    const mesAtual = hoje.getMonth() + 1; // 1 a 12
    const diaAtual = hoje.getDate();

    // A lógica de negócio: buscar aniversariantes deste mês
    for (const usuario of usuarios) {
      if (!usuario.telefone) continue;

      try {
        const { semanas, passageirosSemData } = await passageiroService.listarAniversariantesDoMes(usuario.id, mesAtual);

        // Precisamos filtrar apenas a semana em que estamos. 
        const semanaAtualNoMes = Math.ceil(diaAtual / 7);
        const semanaGarantida = semanaAtualNoMes > 5 ? 5 : semanaAtualNoMes;

        const dadosDaSemana = semanas.find(s => s.semana === semanaGarantida);
        const aniversariantesList = dadosDaSemana?.aniversariantes || [];

        // Notificar via notificationService (que gerenciará templates, instâncias, envio)
        await notificationService.notifyDriver(usuario.telefone, EVENTO_MOTORISTA_ANIVERSARIANTES_SEMANA, {
            nomeMotorista: usuario.nome,
            aniversariantesList: aniversariantesList.map((p: any) => ({
                veiculo: formatarPlacaExibicao(p.veiculo.placa),
                escola: p.escola.nome,
                nome: p.nome,
                dia: p.dia,
                mes: mesAtual
            })),
            passageirosSemData
        });

        logger.info({ usuarioId: usuario.id, celular: usuario.telefone }, "[BirthdayReminder] Lembrete enfileirado/enviado com sucesso.");

      } catch (err: any) {
        logger.error({ err: err.message, usuarioId: usuario.id }, "[BirthdayReminder] Erro ao processar lembrete para usuário");
      }
    }

    logger.info("[BirthdayReminder] Job semanal concluído.");
  }
};
