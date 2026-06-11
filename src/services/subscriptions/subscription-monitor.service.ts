import { logger } from "../../config/logger.js";
import { SubscriptionStatus, ConfigKey, CheckoutPaymentMethod, AtividadeAcao, AtividadeEntidadeTipo } from "../../types/enums.js";
import { historicoService } from "../historico.service.js";
import { subscriptionService } from "./subscription.service.js";
import { subscriptionBillingService } from "./subscription-billing.service.js";
import { monitorRepository } from "../../repositories/monitor.repository.js";
import { notificationRepository } from "../../repositories/notification.repository.js";
import { notificationService, DriverEventType } from "../notifications/notification.service.js";
import { getConfigNumber, getConfig } from "../configuracao.service.js";
import { getNowBR, getEndOfDayBR, addDays, parseLocalDate, diffInDays } from "../../utils/date.utils.js";
import {
  EVENTO_MOTORISTA_ASSINATURA_ATRASADA,
  EVENTO_MOTORISTA_ASSINATURA_VENCEU,
  EVENTO_MOTORISTA_TESTE_ENCERRADO,
  EVENTO_MOTORISTA_TESTE_EXPIRANDO,
  EVENTO_MOTORISTA_ASSINATURA_VENCENDO,
  EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO,
  EVENTO_MOTORISTA_TESTE_HOJE,
  EVENTO_MOTORISTA_CARTAO_COBRANCA_AVISO,
  EVENTO_MOTORISTA_TRIAL_D7_ENGAJADO,
  EVENTO_MOTORISTA_TRIAL_D7_INATIVO,
  EVENTO_MOTORISTA_TRIAL_D14_ULTIMO_AVISO,
  EVENTO_MOTORISTA_TRIAL_RECUPERACAO_1,
  EVENTO_MOTORISTA_TRIAL_RECUPERACAO_2,
  EVENTO_MOTORISTA_TRIAL_RECUPERACAO_FINAL,
  EVENTO_MOTORISTA_RENOVACAO_LEMBRETE,
  EVENTO_MOTORISTA_RENOVACAO_URGENCIA,
  EVENTO_MOTORISTA_RENOVACAO_RECUPERACAO_1,
  EVENTO_MOTORISTA_RENOVACAO_RECUPERACAO_FINAL,
} from "../../config/constants.js";

/**
 * Monitor de Assinaturas (Job Logic)
 * Responsável por gerenciar transições automáticas de estado por tempo (Cron).
 */
export const subscriptionMonitorService = {

  // ---------------------------------------------------------------------------
  // ORQUESTRADOR
  // ---------------------------------------------------------------------------

  async runDailyCheck(): Promise<void> {
    logger.info("[SubscriptionMonitor] Iniciando verificação diária...");

    try {
      const daysBeforeTrial = await getConfigNumber(ConfigKey.SAAS_DIAS_AVISO_TRIAL, 3);

      // --- TRIAL ---
      await this.warnExpiringTrials();                   // Avisos antes de expirar (3 dias, 1 dia)
      await this.notifyTrialMidpoint();                   // D+7: engajamento ou ativação
      await this.expireTrials();                          // D=trial_ends_at: expira + notifica
      await this.notifyTrialRecoveries();                 // D+16/+20/+25: recuperação pós-expiry

      // --- ASSINATURA PAGA ---
      await this.checkOverduePayments();                  // D=venc: ACTIVE→PAST_DUE; D+carência: →EXPIRED
      await this.notifyOverdueReminders();                // D+1/+2: lembretes PAST_DUE
      await this.notifyRenewalRecoveries();               // D+5/+10: recuperação pós-EXPIRED

      // --- LIMPEZA ---
      await this.cancelExpiredPendingInvoices();          // Cancela faturas PENDING vencidas

    } catch (error: any) {
      logger.error({ error: error.message }, "[SubscriptionMonitor] Erro na verificação diária");
      throw error;
    }
  },

  // ---------------------------------------------------------------------------
  // HELPERS — deduplicação via assinatura_notificacoes
  // ---------------------------------------------------------------------------

  async hasNotified(usuarioId: string, tipo: string, cicloRef: string): Promise<boolean> {
    return notificationRepository.hasNotified(usuarioId, tipo, cicloRef);
  },

  async logNotification(usuarioId: string, tipo: string, cicloRef: string, subId?: string, description?: string): Promise<void> {
    if (subId) {
      await historicoService.log({
        usuario_id: usuarioId,
        entidade_tipo: AtividadeEntidadeTipo.SAAS_ASSINATURA,
        entidade_id: subId,
        acao: AtividadeAcao.NOTIFICACAO_WHATSAPP,
        descricao: description || `Notificação automática enviada via WhatsApp (${tipo})`
      });
    }
    return notificationRepository.logNotification(usuarioId, tipo, cicloRef);
  },

  // Retorna YYYY-MM-DD de uma string ISO ou Date
  toCicloRef(date: string | Date): string {
    const d = typeof date === "string" ? parseLocalDate(date) : date;
    return d.toISOString().slice(0, 10);
  },

  // Janela de N±1 dias a partir de uma data de referência (resistente a job skippe)
  windowAround(baseDate: Date, daysAgo: number): { from: string; to: string } {
    return {
      from: addDays(baseDate, -(daysAgo + 1)).toISOString(),
      to:   getEndOfDayBR(addDays(baseDate, -(daysAgo - 1))).toISOString(),
    };
  },

  // ---------------------------------------------------------------------------
  // LIMPEZA DE FATURAS
  // ---------------------------------------------------------------------------

  async cancelExpiredPendingInvoices(): Promise<void> {
    logger.info("[SubscriptionMonitor] Verificando faturas PENDING vencidas...");
    const now = getNowBR().toISOString();

    const { error } = await monitorRepository.cancelExpiredPendingInvoices(now);

    if (error) {
      logger.error({ error }, "[SubscriptionMonitor] Erro ao cancelar faturas vencidas");
    } else {
      logger.info("[SubscriptionMonitor] Faturas vencidas canceladas com sucesso (se existiam).");
    }
  },

  // ---------------------------------------------------------------------------
  // TRIAL — avisos antes de expirar
  // ---------------------------------------------------------------------------

  async warnExpiringTrials(): Promise<void> {
    const now = getNowBR();
    const daysBeforeExpiry = await getConfigNumber(ConfigKey.SAAS_DIAS_AVISO_TRIAL, 3);
    
    // Janela alargada para pegar qualquer um que expire em até N dias
    const windowStart = now.toISOString();
    const windowEnd = getEndOfDayBR(addDays(now, daysBeforeExpiry)).toISOString();

    const { data: expiring, error } = await monitorRepository.getExpiringTrials(windowStart, windowEnd);

    if (error || !expiring?.length) return;

    for (const sub of expiring) {
      const user = (sub as any).usuarios;
      if (!user?.telefone || !sub.trial_ends_at) continue;

      const daysLeft = diffInDays(now, sub.trial_ends_at);

      // Determinamos o tipo de evento baseado nos dias restantes
      // 0 dias = Hoje
      // 1 dia = Amanhã (Urgente)
      // N dias = Aviso normal
      let tipo: DriverEventType = EVENTO_MOTORISTA_TESTE_EXPIRANDO;
      if (daysLeft === 1) tipo = EVENTO_MOTORISTA_TRIAL_D14_ULTIMO_AVISO;
      if (daysLeft === 0) tipo = EVENTO_MOTORISTA_TESTE_HOJE;
      
      const cicloRef = this.toCicloRef(sub.trial_ends_at);
      
      if (await this.hasNotified(sub.usuario_id, tipo, cicloRef)) continue;

      await notificationService.notifyDriver(user.telefone, tipo, {
        nomeMotorista: user.nome,
        trialDays: daysLeft,
        dataVencimento: sub.trial_ends_at,
      });
      await this.logNotification(sub.usuario_id, tipo, cicloRef, sub.id, `Aviso de fim de período de testes enviado (Faltam ${daysLeft} dias).`);
    }
  },

  // ---------------------------------------------------------------------------
  // TRIAL — D+7 engajamento ou ativação
  // ---------------------------------------------------------------------------

  async notifyTrialMidpoint(): Promise<void> {
    const now = getNowBR();
    const { from, to } = this.windowAround(now, 7);

    const { data: trials, error } = await monitorRepository.getMidpointTrials(from, to);

    if (error) {
      logger.error({ error: error.message }, "[SubscriptionMonitor] Erro ao buscar trials D+7");
      return;
    }
    if (!trials?.length) return;

    for (const sub of trials) {
      const user = (sub as any).usuarios;
      if (!user?.telefone || !sub.trial_ends_at) continue;

      const cicloRef = this.toCicloRef(sub.trial_ends_at);
      const tipoEngajado = EVENTO_MOTORISTA_TRIAL_D7_ENGAJADO;
      const tipoInativo  = EVENTO_MOTORISTA_TRIAL_D7_INATIVO;

      // Evita reenvio mesmo que o job rode com atraso
      const jaEnviouEngajado = await this.hasNotified(sub.usuario_id, tipoEngajado, cicloRef);
      const jaEnviouInativo  = await this.hasNotified(sub.usuario_id, tipoInativo, cicloRef);
      if (jaEnviouEngajado || jaEnviouInativo) continue;

      const { count } = await monitorRepository.getPassengerCount(sub.usuario_id);

      const daysLeft = diffInDays(now, sub.trial_ends_at);
      const isEngaged = (count ?? 0) > 0;
      const tipo = isEngaged ? tipoEngajado : tipoInativo;

      await notificationService.notifyDriver(user.telefone, tipo, {
        nomeMotorista: user.nome,
        trialDays: daysLeft,
      });
      await this.logNotification(sub.usuario_id, tipo, cicloRef, sub.id, `Dica de engajamento no app enviada (Dia 7).`);
    }
  },

  // ---------------------------------------------------------------------------
  // TRIAL — D+14 último aviso (só se ainda não tem fatura PENDING)
  // ---------------------------------------------------------------------------

  // notifyTrialLastCall removido em favor de warnExpiringTrials unificado

  // ---------------------------------------------------------------------------
  // TRIAL — expira e notifica (D=trial_ends_at)
  // ---------------------------------------------------------------------------

  async expireTrials(): Promise<void> {
    const now = getNowBR().toISOString();

    const { data: expiredTrials, error } = await monitorRepository.getExpiredTrials(now);

    if (error) {
      logger.error({ error: error.message }, "[SubscriptionMonitor] Erro ao buscar trials expirados");
      return;
    }
    if (!expiredTrials?.length) return;

    logger.info({ count: expiredTrials.length }, "[SubscriptionMonitor] Expirando trials...");

    for (const sub of expiredTrials) {
      await subscriptionService.updateStatus(sub.id, SubscriptionStatus.EXPIRED, "Período de teste encerrado.");

      await historicoService.log({
        usuario_id: sub.usuario_id,
        entidade_tipo: AtividadeEntidadeTipo.SAAS_ASSINATURA,
        entidade_id: sub.id,
        acao: AtividadeAcao.SAAS_ASSINATURA_EXPIRADA,
        descricao: "Seu período de teste grátis expirou. Assine agora para manter o acesso."
      });

      const user = (sub as any).usuarios;
      if (user?.telefone) {
        await notificationService.notifyDriver(user.telefone, EVENTO_MOTORISTA_TESTE_ENCERRADO, {
          nomeMotorista: user.nome,
        });
        await this.logNotification(sub.usuario_id, EVENTO_MOTORISTA_TESTE_ENCERRADO, this.toCicloRef(sub.trial_ends_at || new Date()), sub.id, "Aviso de expiração de teste grátis enviado.");
      }
    }
  },

  // ---------------------------------------------------------------------------
  // TRIAL — recuperação pós-expirado (D+16, D+20, D+25)
  // Identifica pelo: status=EXPIRED e data_vencimento IS NULL (nunca pagou)
  // ---------------------------------------------------------------------------

  async notifyTrialRecoveries(): Promise<void> {
    const now = getNowBR();

    const { data: expired, error } = await monitorRepository.getExpiredTrialsForRecovery();

    if (error) {
      logger.error({ error: error.message }, "[SubscriptionMonitor] Erro ao buscar trials expirados para recuperação");
      return;
    }
    if (!expired?.length) return;

    const isPromotionActive = (await getConfig(ConfigKey.SAAS_PROMOCAO_ATIVA, "false")) === "true";
    let valorPromocional: number | undefined;
    if (isPromotionActive) {
      const { data: plano } = await monitorRepository.getPromotionValue();
      valorPromocional = plano?.valor_promocional ?? undefined;
    }

    const recoverySteps = [
      { daysAgo: 14, tipo: EVENTO_MOTORISTA_TRIAL_RECUPERACAO_1    },
      { daysAgo: 20, tipo: EVENTO_MOTORISTA_TRIAL_RECUPERACAO_2    },
      { daysAgo: 25, tipo: EVENTO_MOTORISTA_TRIAL_RECUPERACAO_FINAL },
    ];

    for (const sub of expired) {
      const user = (sub as any).usuarios;
      if (!user?.telefone || !sub.trial_ends_at) continue;

      const cicloRef = this.toCicloRef(sub.trial_ends_at);
      const daysSinceExpiry = diffInDays(sub.trial_ends_at, now);

      for (const step of recoverySteps) {
        const inWindow = daysSinceExpiry >= step.daysAgo - 1 && daysSinceExpiry <= step.daysAgo + 1;
        if (!inWindow) continue;
        if (await this.hasNotified(sub.usuario_id, step.tipo, cicloRef)) continue;

        await notificationService.notifyDriver(user.telefone, step.tipo, {
          nomeMotorista: user.nome,
          valorPromocional: step.tipo === EVENTO_MOTORISTA_TRIAL_RECUPERACAO_2 ? valorPromocional : undefined,
        });
        await this.logNotification(sub.usuario_id, step.tipo, cicloRef);
        break; // Um step por execução por usuário
      }
    }
  },

  // ---------------------------------------------------------------------------
  // ASSINATURA PAGA — transições ACTIVE → PAST_DUE → EXPIRED
  // ---------------------------------------------------------------------------

  async checkOverduePayments(): Promise<void> {
    const now = getNowBR();
    const gracePeriod = await getConfigNumber(ConfigKey.SAAS_DIAS_CARENCIA, 3);

    const nowStr = now.toISOString();
    const graceLimitDate = getEndOfDayBR(addDays(now, -gracePeriod)).toISOString();

    const { data: pastDue, error: pdError } = await monitorRepository.getPastDueForGracePeriod(nowStr, graceLimitDate);

    if (pdError) {
      logger.error({ error: pdError.message }, "[SubscriptionMonitor] Erro ao buscar assinaturas vencidas");
    } else if (pastDue?.length) {
      for (const sub of pastDue) {
        await subscriptionService.updateStatus(sub.id, SubscriptionStatus.PAST_DUE, "Pagamento pendente (Vencido).");
        
        await historicoService.log({
          usuario_id: sub.usuario_id,
          entidade_tipo: AtividadeEntidadeTipo.SAAS_ASSINATURA,
          entidade_id: sub.id,
          acao: AtividadeAcao.SAAS_ASSINATURA_ATRASO,
          descricao: "Sua assinatura entrou em carência por falta de pagamento. Regularize para evitar o bloqueio."
        });

        const user = (sub as any).usuarios;
        if (user?.telefone) {
          await notificationService.notifyDriver(user.telefone, EVENTO_MOTORISTA_ASSINATURA_VENCEU, {
            nomeMotorista: user.nome,
          });
          await this.logNotification(sub.usuario_id, EVENTO_MOTORISTA_ASSINATURA_VENCEU, this.toCicloRef(sub.data_vencimento || new Date()), sub.id, "Aviso de mensalidade vencida enviado.");
        }
      }
    }

    const { data: expired, error: expError } = await monitorRepository.getExpiredForGracePeriod(graceLimitDate);

    if (expError) {
      logger.error({ error: expError.message }, "[SubscriptionMonitor] Erro ao buscar assinaturas p/ expirar");
    } else if (expired?.length) {
      for (const sub of expired) {
        await subscriptionService.updateStatus(sub.id, SubscriptionStatus.EXPIRED, `Assinatura expirada por falta de pagamento (${gracePeriod} dias de atraso).`);

        await historicoService.log({
          usuario_id: sub.usuario_id,
          entidade_tipo: AtividadeEntidadeTipo.SAAS_ASSINATURA,
          entidade_id: sub.id,
          acao: AtividadeAcao.SAAS_ASSINATURA_EXPIRADA,
          descricao: "Assinatura expirada por falta de pagamento. Acesso bloqueado."
        });

        const user = (sub as any).usuarios;
        if (user?.telefone) {
          await notificationService.notifyDriver(user.telefone, EVENTO_MOTORISTA_ASSINATURA_ATRASADA, {
            nomeMotorista: user.nome,
            diasAtraso: gracePeriod,
          });
          await this.logNotification(sub.usuario_id, EVENTO_MOTORISTA_ASSINATURA_ATRASADA, this.toCicloRef(sub.data_vencimento || new Date()), sub.id, "Aviso de assinatura suspensa enviado.");
        }
      }
    }
  },

  // ---------------------------------------------------------------------------
  // ASSINATURA PAGA — lembretes D+1 e D+2 em PAST_DUE
  // ---------------------------------------------------------------------------

  async notifyOverdueReminders(): Promise<void> {
    const now = getNowBR();

    const { data: pastDue, error } = await monitorRepository.getPastDueForReminders();

    if (error) {
      logger.error({ error: error.message }, "[SubscriptionMonitor] Erro ao buscar PAST_DUE para lembretes");
      return;
    }
    if (!pastDue?.length) return;

    const reminderSteps: { daysAgo: number, tipo: DriverEventType }[] = [
      { daysAgo: 1, tipo: EVENTO_MOTORISTA_RENOVACAO_LEMBRETE  },
      { daysAgo: 2, tipo: EVENTO_MOTORISTA_RENOVACAO_URGENCIA  },
    ];

    for (const sub of pastDue) {
      const user = (sub as any).usuarios;
      if (!user?.telefone || !sub.data_vencimento) continue;

      const cicloRef = this.toCicloRef(sub.data_vencimento);
      const daysSince = diffInDays(sub.data_vencimento, now);

      for (const step of reminderSteps) {
        if (daysSince !== step.daysAgo) continue;
        if (await this.hasNotified(sub.usuario_id, step.tipo, cicloRef)) continue;

        // Inclui PIX se existir fatura pendente
        const { data: fatura } = await monitorRepository.getPendingInvoiceByUserId(sub.usuario_id);

        await notificationService.notifyDriver(user.telefone, step.tipo, {
          nomeMotorista: user.nome,
          valor: fatura?.valor ? Number(fatura.valor) : undefined,
          pixCopiaECola: fatura?.pix_copy_paste ?? undefined,
          metodoCobranca: sub.metodo_pagamento ?? undefined,
        });
        await this.logNotification(sub.usuario_id, step.tipo, cicloRef, sub.id, `Lembrete de pagamento pendente enviado (${step.daysAgo} dias de atraso).`);
        break;
      }
    }
  },

  // ---------------------------------------------------------------------------
  // ASSINATURA PAGA — recuperação D+5 e D+10 pós-EXPIRED
  // Identifica pelo: status=EXPIRED e data_vencimento IS NOT NULL (já pagou antes)
  // ---------------------------------------------------------------------------

  async notifyRenewalRecoveries(): Promise<void> {
    const now = getNowBR();

    const { data: expired, error } = await monitorRepository.getExpiredForRecovery();

    if (error) {
      logger.error({ error: error.message }, "[SubscriptionMonitor] Erro ao buscar expirados (assinantes) para recuperação");
      return;
    }
    if (!expired?.length) return;

    const recoverySteps = [
      { daysAgo: 5,  tipo: EVENTO_MOTORISTA_RENOVACAO_RECUPERACAO_1     },
      { daysAgo: 10, tipo: EVENTO_MOTORISTA_RENOVACAO_RECUPERACAO_FINAL  },
    ];

    for (const sub of expired) {
      const user = (sub as any).usuarios;
      if (!user?.telefone || !sub.data_vencimento) continue;

      const cicloRef = this.toCicloRef(sub.data_vencimento);
      const daysSince = diffInDays(sub.data_vencimento, now);

      for (const step of recoverySteps) {
        const inWindow = daysSince >= step.daysAgo - 1 && daysSince <= step.daysAgo + 1;
        if (!inWindow) continue;
        if (await this.hasNotified(sub.usuario_id, step.tipo, cicloRef)) continue;

        await notificationService.notifyDriver(user.telefone, step.tipo, {
          nomeMotorista: user.nome,
        });
        await this.logNotification(sub.usuario_id, step.tipo, cicloRef, sub.id, `Oferta de recuperação de assinatura enviada (${step.daysAgo} dias após expiração).`);
        break;
      }
    }
  },

  // ---------------------------------------------------------------------------
  // ASSINATURA PAGA — geração antecipada de faturas (D-N)
  // ---------------------------------------------------------------------------

  async generateRenewalInvoices(daysBefore: number): Promise<void> {
    const now = getNowBR();
    const threshold = addDays(now, daysBefore);
    const maxRetries = await getConfigNumber(ConfigKey.SAAS_MAX_TENTATIVAS_CARTAO, 3);

    const { data: expiring, error } = await monitorRepository.getExpiringSubscriptions(getEndOfDayBR(threshold).toISOString());

    if (error || !expiring) return;

    for (const sub of expiring) {
      const user = (sub as any).usuarios;
      const isCard = sub.metodo_pagamento === "credit_card";

      const { data: pendingInvoice } = await monitorRepository.getPendingInvoiceByUserId(sub.usuario_id);

      if (pendingInvoice) continue;

      // Se for assinatura via cartão, mas não tiver cartão preferencial definido, pula a cobrança automática
      if (isCard && !sub.metodo_pagamento_preferencial_id) {
          logger.info({ subId: sub.id }, "[SubscriptionMonitor] Assinatura via cartão sem método preferencial. Pulando renovação automática.");
          continue;
      }

      // Limite de tentativas para cartão: conta faturas FAILED nos últimos 30 dias
      if (isCard) {
        const { count: failedCount } = await monitorRepository.getFailedCardInvoicesCount(sub.usuario_id, addDays(now, -30).toISOString());

        if ((failedCount ?? 0) >= maxRetries) {
          logger.warn({ subId: sub.id, failedCount }, "[SubscriptionMonitor] Limite de tentativas de cartão atingido. Pulando.");
          if (user?.telefone) {
            const cicloRef = this.toCicloRef(sub.data_vencimento);
            if (!await this.hasNotified(sub.usuario_id, EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO, cicloRef)) {
              await notificationService.notifyDriver(user.telefone, EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO, {
                nomeMotorista: user.nome,
                erro: "Número máximo de tentativas atingido.",
              });
              await this.logNotification(sub.usuario_id, EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO, cicloRef, sub.id, "Aviso de falha na cobrança automática do cartão enviado.");
            }
          }
          continue;
        }

        // Aviso antecipado de cobrança automática (apenas uma vez por ciclo)
        const cicloRef = this.toCicloRef(sub.data_vencimento);
        if (!await this.hasNotified(sub.usuario_id, EVENTO_MOTORISTA_CARTAO_COBRANCA_AVISO, cicloRef)) {
          const cardLast4 = (sub as any).metodos_pagamento?.last_4_digits;
          if (user?.telefone) {
            await notificationService.notifyDriver(user.telefone, EVENTO_MOTORISTA_CARTAO_COBRANCA_AVISO, {
              nomeMotorista: user.nome,
              valor: sub.planos?.valor ? Number(sub.planos.valor) : undefined,
              dataVencimento: sub.data_vencimento,
              cardLast4,
            });
            await this.logNotification(sub.usuario_id, EVENTO_MOTORISTA_CARTAO_COBRANCA_AVISO, cicloRef, sub.id, "Aviso antecipado de cobrança automática no cartão enviado.");
          }
        }
      }

      logger.info({ subId: sub.id, userId: sub.usuario_id }, "[SubscriptionMonitor] Gerando fatura/cobrança de renovação automática...");

      try {
        const fatura = await subscriptionBillingService.createInvoice(sub.usuario_id, {
          planId: sub.plano_id,
          paymentMethod: sub.metodo_pagamento || CheckoutPaymentMethod.PIX,
          saveCard: false,
        });

        if (!isCard && user?.telefone && fatura.pix_copy_paste) {
          await notificationService.notifyDriver(user.telefone, EVENTO_MOTORISTA_ASSINATURA_VENCENDO, {
            nomeMotorista: user.nome,
            dataVencimento: sub.data_vencimento,
            pixCopiaECola: fatura.pix_copy_paste,
            valor: fatura.valor,
          });
          const cicloRef = this.toCicloRef(sub.data_vencimento || new Date());
          await this.logNotification(sub.usuario_id, EVENTO_MOTORISTA_ASSINATURA_VENCENDO, cicloRef, sub.id, "Aviso de vencimento de PIX enviado.");
        } else if (isCard) {
          logger.info({ userId: sub.usuario_id }, "[SubscriptionMonitor] Cobrança de renovação no cartão gerada com sucesso.");
        }
      } catch (e: any) {
        logger.error({ subId: sub.id, error: e.message }, "[SubscriptionMonitor] Falha ao gerar fatura/cobrança automática");

        if (isCard && user?.telefone) {
          await notificationService.notifyDriver(user.telefone, EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO, {
            nomeMotorista: user.nome,
            erro: e.message || "Cartão recusado",
          });
          const cicloRef = this.toCicloRef(sub.data_vencimento || new Date());
          await this.logNotification(sub.usuario_id, EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO, cicloRef, sub.id, "Aviso de falha na cobrança do cartão enviado.");
        }
      }
    }
  },
};
