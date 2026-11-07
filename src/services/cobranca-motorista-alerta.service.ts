import { cobrancaRepository } from "../repositories/cobranca.repository.js";
import { passageiroRepository } from "../repositories/passageiro.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { logger } from "../config/logger.js";
import {
  EVENTO_MOTORISTA_COBRANCAS_HOJE,
  EVENTO_MOTORISTA_CONFERENCIA_NOTURNA,
  EVENTO_MOTORISTA_RESUMO_SEMANAL_PARCELAS,
} from "../config/constants.js";
import {
  diffInDays,
  getNowBR,
  getShortWeekDayBR,
  parseLocalDate,
  toPersistenceString,
} from "../utils/date.utils.js";
import { NotificationChannelEnum, SubscriptionStatus } from "../types/enums.js";
import { notificationService } from "./notifications/notification.service.js";
import { NotificationContextFormatter } from "./notifications/utils/notification-context.formatter.js";
import { getResponsavelFromPassageiro, PassageiroCobrancaInfo } from "./cobranca-helpers.js";

export const cobrancaMotoristaAlertaService = {
  async processarResumoSemanalMotorista(
    motorista: { id: string; nome: string; telefone: string; email?: string } | string
  ): Promise<boolean> {
    let motoristaObj: { id: string; nome: string; telefone: string; email?: string } | null = null;

    if (typeof motorista === "string") {
      const { data: user } = await userRepository.getById(motorista);
      if (user) {
        motoristaObj = {
          id: user.id,
          nome: user.nome,
          telefone: user.telefone || "",
          email: user.email ?? undefined,
        };
      }
    } else {
      motoristaObj = motorista;
    }

    if (!motoristaObj || !motoristaObj.telefone) {
      return false;
    }

    const now = getNowBR();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const dataRefStr = `${day}/${month}`;
    const hojeStr = toPersistenceString(now);

    const ontem = new Date(now);
    ontem.setDate(now.getDate() - 1);
    const ontemStr = toPersistenceString(ontem);

    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevMonthStr = String(prevMonth + 1).padStart(2, "0");
    const primeiroDiaMesAnteriorStr = `${prevYear}-${prevMonthStr}-01`;

    const proximos7Dias = new Date(now);
    proximos7Dias.setDate(now.getDate() + 7);
    const proximos7DiasStr = toPersistenceString(proximos7Dias);

    const { data: cobrancasAtrasadas } = await cobrancaRepository.getCobrancasPendentesPorPeriodo(
      motoristaObj.id,
      primeiroDiaMesAnteriorStr,
      ontemStr
    );

    const { data: cobrancasProximos } = await cobrancaRepository.getCobrancasPendentesPorPeriodo(
      motoristaObj.id,
      hojeStr,
      proximos7DiasStr
    );

    const atrasadosList = (cobrancasAtrasadas || []).map((c) => {
      const passageiroInfo = c.passageiro as PassageiroCobrancaInfo | undefined;
      const diasAtraso = diffInDays(c.data_vencimento, now);

      let mesOrigemStr: string | undefined;
      if (c.mes !== now.getMonth() + 1 || c.ano !== now.getFullYear()) {
        mesOrigemStr = NotificationContextFormatter.formatMonthYearShort(c.mes, c.ano) || undefined;
      }

      const respInfo = getResponsavelFromPassageiro(passageiroInfo);
      return {
        passageiroNome: passageiroInfo?.nome || "Aluno",
        responsavelNome: respInfo.nome,
        telefoneResponsavel: respInfo.telefone,
        valor: Number(c.valor) || 0,
        diasAtraso,
        mesOrigemStr,
      };
    });

    atrasadosList.sort((a, b) => b.diasAtraso - a.diasAtraso);

    const proximosList = (cobrancasProximos || []).map((c) => {
      const passageiroInfo = c.passageiro as PassageiroCobrancaInfo | undefined;
      const respInfo = getResponsavelFromPassageiro(passageiroInfo);
      const dt = parseLocalDate(c.data_vencimento);
      const diaSemanaStr = getShortWeekDayBR(dt);
      const dataVencimentoStr = `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`;

      return {
        passageiroNome: passageiroInfo?.nome,
        responsavelNome: respInfo.nome,
        dataVencimentoStr,
        diaSemanaStr,
        valor: Number(c.valor) || 0,
      };
    });

    if (atrasadosList.length === 0 && proximosList.length === 0) {
      return false;
    }

    const totalAtrasado = atrasadosList.reduce((acc, curr) => acc + curr.valor, 0);
    const totalProximos = proximosList.reduce((acc, curr) => acc + curr.valor, 0);

    await notificationService.notifyDriver(
      motoristaObj.telefone,
      EVENTO_MOTORISTA_RESUMO_SEMANAL_PARCELAS,
      {
        nomeMotorista: motoristaObj.nome,
        dataRefStr,
        cobrancasAtrasadasList: atrasadosList,
        cobrancasProximos7DiasList: proximosList,
        totalAtrasado,
        totalProximos,
        qtdAtrasados: atrasadosList.length,
        qtdProximos: proximosList.length,
      },
      {
        channels: [NotificationChannelEnum.FIREBASE],
        usuarioId: motoristaObj.id,
        email: motoristaObj.email,
      }
    );

    return true;
  },

  async enviarResumoSemanalMotoristas(): Promise<void> {
    logger.info("[CobrancaMotoristaAlertaService] Iniciando envio do resumo semanal de cobrança...");

    try {
      const { data: motoristas } = await userRepository.listMotoristasAtivosParaResumoCobranca();

      if (!motoristas || motoristas.length === 0) {
        logger.info("[CobrancaMotoristaAlertaService] Nenhum motorista elegível para resumo semanal hoje.");
        return;
      }

      let sentCount = 0;

      for (const m of motoristas) {
        try {
          const sent = await this.processarResumoSemanalMotorista(m);
          if (sent) sentCount++;
        } catch (notifErr: unknown) {
          const errorMsg = notifErr instanceof Error ? notifErr.message : String(notifErr);
          logger.error(
            { error: errorMsg, motoristaId: m.id },
            "[CobrancaMotoristaAlertaService] Erro ao enviar resumo semanal para motorista"
          );
        }
      }

      logger.info({ sentCount }, "[CobrancaMotoristaAlertaService] Resumo semanal concluído.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "[CobrancaMotoristaAlertaService] Erro geral no resumo semanal");
    }
  },

  async dispararPushAlertaHojeParaMotorista(
    motorista: { id: string; nome: string; telefone: string | null; email?: string | null },
    listaCobrancas: Array<{ valor: unknown; passageiro?: unknown }>,
    temAlunos: boolean,
    semanaMes = 1
  ): Promise<boolean> {
    const totalValor = listaCobrancas.reduce((acc, curr) => acc + (Number(curr.valor) || 0), 0);
    const primeiraCobranca = listaCobrancas[0];
    const primeiroPassageiro = primeiraCobranca?.passageiro;
    const passageiroObj = (Array.isArray(primeiroPassageiro) ? primeiroPassageiro[0] : primeiroPassageiro) as
      | PassageiroCobrancaInfo
      | undefined;

    const nomePassageiro = passageiroObj?.nome || "Aluno";
    const generoPassageiro = passageiroObj?.genero || null;
    const respInfo = getResponsavelFromPassageiro(passageiroObj);
    const nomeResponsavel = respInfo.nome || "";

    return notificationService.notifyDriver(
      motorista.telefone || "",
      EVENTO_MOTORISTA_COBRANCAS_HOJE,
      {
        nomeMotorista: motorista.nome,
        qtdCobrancas: listaCobrancas.length,
        valorTotal: totalValor,
        nomePassageiro,
        generoPassageiro,
        nomeResponsavel,
        temAlunos,
        semanaMes,
        usuarioId: motorista.id,
      },
      {
        channels: [NotificationChannelEnum.FIREBASE],
        usuarioId: motorista.id,
        email: motorista.email ?? undefined,
      }
    );
  },

  async processarAlertaVencimentoHojeMotorista(
    motorista: { id: string; nome: string; telefone: string | null; email?: string | null } | string
  ): Promise<{ sent: boolean; qtdCobrancas: number; valorTotal: number; temAlunos: boolean }> {
    let motoristaObj: { id: string; nome: string; telefone: string | null; email?: string | null } | null = null;

    if (typeof motorista === "string") {
      const { data: user } = await userRepository.getById(motorista);
      if (user) {
        motoristaObj = {
          id: user.id,
          nome: user.nome,
          telefone: user.telefone || null,
          email: user.email ?? undefined,
        };
      }
    } else {
      motoristaObj = motorista;
    }

    if (!motoristaObj) {
      return { sent: false, qtdCobrancas: 0, valorTotal: 0, temAlunos: false };
    }

    const now = getNowBR();
    const hojeStr = toPersistenceString(now);

    const [cobrancasResult, contagemMap] = await Promise.all([
      cobrancaRepository.getPendentesVencendoHojeParaMotoristas(hojeStr, motoristaObj.id),
      passageiroRepository.getContagemPassageirosAtivosPorMotorista([motoristaObj.id]),
    ]);

    const lista = cobrancasResult.data || [];
    const contagemAlunos = contagemMap.get(motoristaObj.id) || 0;
    const temAlunos = contagemAlunos >= 2;
    const totalValor = lista.reduce((acc, curr) => acc + (Number(curr.valor) || 0), 0);
    const semanaMes = Math.ceil(now.getDate() / 7);

    const sent = await this.dispararPushAlertaHojeParaMotorista(motoristaObj, lista, temAlunos, semanaMes);

    return {
      sent,
      qtdCobrancas: lista.length,
      valorTotal: totalValor,
      temAlunos,
    };
  },

  async enviarAlertaVencimentoHojeParaMotoristas(): Promise<void> {
    logger.info("[CobrancaMotoristaAlertaService] Iniciando envio do alerta de parcelas de hoje...");

    try {
      const now = getNowBR();
      const hojeStr = toPersistenceString(now);

      const { data: motoristas } = await userRepository.listMotoristasAtivosParaAlertaDiario();

      if (!motoristas || motoristas.length === 0) {
        logger.info("[CobrancaMotoristaAlertaService] Nenhum motorista elegível para o alerta diário.");
        return;
      }

      const motoristaIds = motoristas.map((m) => m.id);

      const [cobrancasResult, contagemMap] = await Promise.all([
        cobrancaRepository.getPendentesVencendoHojeParaMotoristas(hojeStr, motoristaIds),
        passageiroRepository.getContagemPassageirosAtivosPorMotorista(motoristaIds),
      ]);

      if (cobrancasResult.error) {
        logger.error(
          { error: cobrancasResult.error.message },
          "[CobrancaMotoristaAlertaService] Erro ao buscar cobranças pendentes de hoje"
        );
        return;
      }

      type CobrancaItem = NonNullable<typeof cobrancasResult.data>[number];
      const cobrancasPorMotorista = new Map<string, CobrancaItem[]>();

      for (const c of cobrancasResult.data || []) {
        if (!c.usuario_id) continue;
        if (!cobrancasPorMotorista.has(c.usuario_id)) {
          cobrancasPorMotorista.set(c.usuario_id, []);
        }
        cobrancasPorMotorista.get(c.usuario_id)!.push(c);
      }

      let sentCount = 0;
      const BATCH_SIZE = 10;
      const isQuintaFeira = now.getDay() === 4;
      const semanaMes = Math.ceil(now.getDate() / 7);

      for (let i = 0; i < motoristas.length; i += BATCH_SIZE) {
        const chunk = motoristas.slice(i, i + BATCH_SIZE);

        await Promise.all(
          chunk.map(async (m) => {
            const lista = cobrancasPorMotorista.get(m.id) || [];
            const contagemAlunos = contagemMap.get(m.id) || 0;
            const temAlunos = contagemAlunos >= 2;
            const assinaturaObj = Array.isArray(m.assinaturas) ? m.assinaturas[0] : m.assinaturas;
            const isTrial = assinaturaObj?.status === SubscriptionStatus.TRIAL;

            if (lista.length === 0 && (isTrial || !isQuintaFeira)) {
              return;
            }

            try {
              const sent = await this.dispararPushAlertaHojeParaMotorista(m, lista, temAlunos, semanaMes);
              if (sent) sentCount++;
            } catch (notifErr: unknown) {
              const errorMsg = notifErr instanceof Error ? notifErr.message : String(notifErr);
              logger.error(
                { error: errorMsg, usuarioId: m.id },
                "[CobrancaMotoristaAlertaService] Erro ao enviar alerta de parcelas de hoje"
              );
            }
          })
        );
      }

      logger.info({ sentCount }, "[CobrancaMotoristaAlertaService] Alerta diário de parcelas concluído.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "[CobrancaMotoristaAlertaService] Erro geral no alerta diário de parcelas");
    }
  },

  isDiaDeDisparoNoturno(dataBR: Date): boolean {
    const diaMes = dataBR.getDate();
    const diaSemana = dataBR.getDay();
    const isFevereiro = dataBR.getMonth() === 1;

    const DIAS_PICO_PAGAMENTO = [5, 10, 15, 20, 25, 30];
    const isFechamentoFevereiro = isFevereiro && diaMes === 28;
    if (DIAS_PICO_PAGAMENTO.includes(diaMes) || isFechamentoFevereiro) {
      return true;
    }

    const JANELA_QUENTE_INICIO = 4;
    const JANELA_QUENTE_FIM = 22;
    const isJanelaQuente = diaMes >= JANELA_QUENTE_INICIO && diaMes <= JANELA_QUENTE_FIM;
    const isDiaSemanaElegivel = diaSemana === 1 || diaSemana === 3 || diaSemana === 5;

    return isJanelaQuente && isDiaSemanaElegivel;
  },

  async enviarLembreteNoturnoBaixasParaMotoristas(): Promise<void> {
    const now = getNowBR();
    if (!this.isDiaDeDisparoNoturno(now)) {
      logger.info(
        { diaMes: now.getDate(), diaSemana: now.getDay() },
        "[CobrancaMotoristaAlertaService] Hoje não é dia de envio do lembrete noturno."
      );
      return;
    }

    logger.info("[CobrancaMotoristaAlertaService] Iniciando envio do lembrete noturno de conferência...");

    try {
      const { data: motoristas } = await userRepository.listMotoristasAtivosParaAlertaDiario();

      if (!motoristas || motoristas.length === 0) {
        logger.info("[CobrancaMotoristaAlertaService] Nenhum motorista elegível para o lembrete noturno.");
        return;
      }

      const motoristaIds = motoristas.map((m) => m.id);
      const contagemMap = await passageiroRepository.getContagemPassageirosAtivosPorMotorista(motoristaIds);

      let sentCount = 0;
      const BATCH_SIZE = 10;

      for (let i = 0; i < motoristas.length; i += BATCH_SIZE) {
        const chunk = motoristas.slice(i, i + BATCH_SIZE);

        await Promise.all(
          chunk.map(async (m) => {
            const contagemAlunos = contagemMap.get(m.id) || 0;
            if (contagemAlunos === 0) return;

            const assinaturaObj = Array.isArray(m.assinaturas) ? m.assinaturas[0] : m.assinaturas;
            const isTrial = assinaturaObj?.status === SubscriptionStatus.TRIAL;

            try {
              const sent = await notificationService.notifyDriver(
                m.telefone || m.email || m.id,
                EVENTO_MOTORISTA_CONFERENCIA_NOTURNA,
                {
                  isTrial,
                  temAlunos: contagemAlunos > 0,
                  nomeMotorista: m.nome,
                  usuarioId: m.id,
                },
                {
                  channels: [NotificationChannelEnum.FIREBASE],
                  usuarioId: m.id,
                  email: m.email ?? undefined,
                }
              );

              if (sent) sentCount++;
            } catch (notifErr: unknown) {
              const errorMsg = notifErr instanceof Error ? notifErr.message : String(notifErr);
              logger.error(
                { error: errorMsg, usuarioId: m.id },
                "[CobrancaMotoristaAlertaService] Erro ao enviar lembrete noturno para motorista"
              );
            }
          })
        );
      }

      logger.info(
        { sentCount, totalMotoristas: motoristas.length },
        "[CobrancaMotoristaAlertaService] Lembrete noturno concluído."
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "[CobrancaMotoristaAlertaService] Erro geral no lembrete noturno");
    }
  },
};
