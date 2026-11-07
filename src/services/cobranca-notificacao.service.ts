import { cobrancaRepository } from "../repositories/cobranca.repository.js";
import { historicoRepository } from "../repositories/historico.repository.js";
import { logger } from "../config/logger.js";
import { AppError } from "../errors/AppError.js";
import {
  EVENTO_PASSAGEIRO_ATRASADO,
  EVENTO_PASSAGEIRO_VENCIMENTO_HOJE,
  EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO,
} from "../config/constants.js";
import { diffInDays, getNowBR, toPersistenceString } from "../utils/date.utils.js";
import { getDriverDisplayName } from "../utils/format.js";
import {
  AtividadeAcao,
  AtividadeEntidadeTipo,
  ConfigKey,
  ModoCobrancaEnum,
  NotificationChannelEnum,
} from "../types/enums.js";
import type { Tables } from "../types/database.types.js";
import { cobrancaCalculoService } from "./cobranca-calculo.service.js";
import { cobrancaPixService, PixGeradoCobrancaResult } from "./cobranca-pix.service.js";
import { historicoService } from "./historico.service.js";
import { getConfigNumber } from "./configuracao.service.js";
import { notificationService } from "./notifications/notification.service.js";
import { addPixWarmupToGenerationQueue } from "../queues/generation.queue.js";
import { getResponsavelFromPassageiro, PassageiroCobrancaInfo } from "./cobranca-helpers.js";

type MotoristaConfigFinRow = Tables<"motorista_configuracoes_financeiras">;
type UsuarioConfigRow = Tables<"usuario_configuracoes">;

interface MotoristaNotificacaoJoin {
  nome?: string;
  apelido?: string | null;
  telefone?: string | null;
  motorista_configuracoes_financeiras?: MotoristaConfigFinRow | MotoristaConfigFinRow[] | null;
  usuario_configuracoes?: UsuarioConfigRow | UsuarioConfigRow[] | null;
}

export const cobrancaNotificacaoService = {
  async toggleNotificacoes(cobrancaId: string, novoStatus: boolean): Promise<boolean> {
    const { data, error } = await cobrancaRepository.toggleNotificacoes(cobrancaId, novoStatus);

    if (error) {
      logger.error({ error, cobrancaId }, "Erro ao alterar status de notificação da cobrança");
      throw new AppError("Erro ao alterar notificações.", 500);
    }

    historicoService.log({
      usuario_id: data.usuario_id,
      entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
      entidade_id: cobrancaId,
      acao: AtividadeAcao.CONFIG_LEMBRETE,
      descricao: `Lembretes automáticos para esta parcela foram ${novoStatus ? "DESATIVADOS" : "REATIVADOS"}.`,
      meta: { desativar_lembretes: novoStatus },
    });

    return data.desativar_lembretes;
  },

  async enviarNotificacoesDiarias(
    obterOuGerarPixFn: (cobrancaId: string) => Promise<PixGeradoCobrancaResult | null> = (id) =>
      cobrancaPixService.obterOuGerarPixCobranca(id)
  ): Promise<void> {
    logger.info("[CobrancaNotificacaoService] Iniciando processo diário de notificações de cobrança...");

    try {
      const now = getNowBR();
      const todayStr = toPersistenceString(now);

      const globalThresholdDays = await getConfigNumber(ConfigKey.PASSAGEIRO_DIAS_AVISO_VENCIMENTO, 2);
      const targetDates = [todayStr];

      for (let adv = 1; adv <= 5; adv++) {
        const dAdv = getNowBR();
        dAdv.setDate(dAdv.getDate() + adv);
        targetDates.push(toPersistenceString(dAdv));
      }

      const atrasos = [3, 5, 7];
      for (const dias of atrasos) {
        const d = getNowBR();
        d.setDate(d.getDate() - dias);
        targetDates.push(toPersistenceString(d));
      }

      const { data: cobrancas, error } = await cobrancaRepository.getPendentesParaNotificacao(targetDates);

      if (error) {
        logger.error({ error: error.message }, "[CobrancaNotificacaoService] Erro ao buscar cobranças pendentes");
        return;
      }

      if (!cobrancas || cobrancas.length === 0) {
        await historicoRepository.deleteFalhasIntegracaoCobrancasResolvidas();
        logger.info("[CobrancaNotificacaoService] Nenhuma cobrança pendente para notificar hoje.");
        return;
      }

      logger.info(
        { count: cobrancas.length },
        "[CobrancaNotificacaoService] Processando notificações para cobranças pendentes..."
      );

      let sentCount = 0;
      const BATCH_SIZE = 3;

      for (let i = 0; i < cobrancas.length; i += BATCH_SIZE) {
        const chunk = cobrancas.slice(i, i + BATCH_SIZE);
        const successfulIdsInChunk: string[] = [];
        let chunkExecutedExternalAction = false;

        const chunkPromises = chunk.map(async (c) => {
          const passageiro = c.passageiro as PassageiroCobrancaInfo | undefined;
          const motorista = c.motorista as MotoristaNotificacaoJoin | undefined;
          const cobrancaId = String(c.id);
          const usuarioId = String(c.usuario_id);

          const resp = getResponsavelFromPassageiro(passageiro);
          if (!resp.telefone && !resp.email) return null;
          if (passageiro?.enviar_notificacoes === false) return null;
          if (passageiro?.isento === true) return null;
          if (c.desativar_lembretes === true) return null;

          const motoristaConfigFin = Array.isArray(motorista?.motorista_configuracoes_financeiras)
            ? motorista.motorista_configuracoes_financeiras[0]
            : motorista?.motorista_configuracoes_financeiras;

          const elegivelLembrete = cobrancaCalculoService.verificarElegibilidadeLembretes({
            motoristaConfig: motoristaConfigFin,
            passageiroModoCobranca: passageiro?.modo_cobranca as ModoCobrancaEnum | null | undefined,
            statusCobranca: String(c.status),
          });

          if (!elegivelLembrete) return null;

          const dataVencimentoStr = String(c.data_vencimento);
          const ultimaNotifStr = c.data_envio_ultima_notificacao as string | null | undefined;
          const lastNotifDateStr = ultimaNotifStr ? toPersistenceString(ultimaNotifStr) : null;

          if (lastNotifDateStr && lastNotifDateStr >= todayStr) {
            return null;
          }

          const motoristaConfig = Array.isArray(motorista?.usuario_configuracoes)
            ? motorista.usuario_configuracoes[0]
            : motorista?.usuario_configuracoes;

          const avisoPrevioAtivo = motoristaConfig?.cobranca_aviso_previo_ativo ?? true;
          const driverThresholdDays = Number(motoristaConfig?.cobranca_dias_aviso_previo) || globalThresholdDays;
          const vencimentoHojeAtivo = motoristaConfig?.cobranca_vencimento_hoje_ativo ?? true;
          const atraso3DiasAtivo = motoristaConfig?.cobranca_atraso_3_dias_ativo ?? true;
          const avisoPrevioWhatsappAtivo = motoristaConfig?.cobranca_aviso_previo_whatsapp_ativo ?? false;

          let eventType:
            | typeof EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO
            | typeof EVENTO_PASSAGEIRO_VENCIMENTO_HOJE
            | typeof EVENTO_PASSAGEIRO_ATRASADO
            | null = null;
          let baseChannels: NotificationChannelEnum[] = [];
          let shouldSend = false;

          if (dataVencimentoStr > todayStr) {
            if (avisoPrevioAtivo) {
              const diasAntecedencia = diffInDays(todayStr, dataVencimentoStr);
              if (diasAntecedencia <= driverThresholdDays && !lastNotifDateStr) {
                eventType = EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO;
                baseChannels = avisoPrevioWhatsappAtivo
                  ? [NotificationChannelEnum.WABA, NotificationChannelEnum.FIREBASE]
                  : [NotificationChannelEnum.FIREBASE];
                shouldSend = true;
              }
            }
          } else if (dataVencimentoStr === todayStr) {
            if (vencimentoHojeAtivo) {
              eventType = EVENTO_PASSAGEIRO_VENCIMENTO_HOJE;
              baseChannels = [NotificationChannelEnum.WABA, NotificationChannelEnum.FIREBASE];
              shouldSend = true;
            }
          } else {
            const diasAtraso = diffInDays(dataVencimentoStr, todayStr);
            if (diasAtraso === 3 && atraso3DiasAtivo) {
              eventType = EVENTO_PASSAGEIRO_ATRASADO;
              baseChannels = [NotificationChannelEnum.WABA, NotificationChannelEnum.FIREBASE];
              shouldSend = true;
            }
          }

          if (!shouldSend || !eventType) {
            if (dataVencimentoStr > todayStr && !c.pix_copia_cola && !c.boleto_linha_digitavel) {
              const diasAntecedenciaRepescagem = diffInDays(todayStr, dataVencimentoStr);
              const modoRepescagem = cobrancaCalculoService.resolverModoEfetivo({
                motoristaModoCobranca: motoristaConfigFin?.modo_cobranca,
                passageiroModoCobranca: passageiro?.modo_cobranca as ModoCobrancaEnum | null | undefined,
              });
              if (diasAntecedenciaRepescagem <= driverThresholdDays && modoRepescagem === ModoCobrancaEnum.AUTOMATICA) {
                try {
                  await addPixWarmupToGenerationQueue(cobrancaId);
                } catch (repErr: unknown) {
                  logger.error(
                    { error: repErr instanceof Error ? repErr.message : String(repErr), cobrancaId },
                    "[CobrancaNotificacaoService] Erro ao enfileirar repescagem de Pix"
                  );
                }
              }
            }
            return null;
          }

          const activeChannels = baseChannels.filter((ch) => {
            if (ch === NotificationChannelEnum.WABA) {
              return Boolean(resp.telefone && resp.telefone.trim());
            }
            return true;
          });

          if (activeChannels.length === 0) return null;

          try {
            const modoEfetivo = cobrancaCalculoService.resolverModoEfetivo({
              motoristaModoCobranca: motoristaConfigFin?.modo_cobranca,
              passageiroModoCobranca: passageiro?.modo_cobranca as ModoCobrancaEnum | null | undefined,
            });

            if (modoEfetivo === ModoCobrancaEnum.DESATIVADO) return null;

            const diasAntecedencia =
              dataVencimentoStr > todayStr ? diffInDays(todayStr, dataVencimentoStr) : undefined;
            const requiresWaba = activeChannels.includes(NotificationChannelEnum.WABA);

            let pixInfo: PixGeradoCobrancaResult | null = null;

            if (requiresWaba) {
              chunkExecutedExternalAction = true;
              pixInfo = await obterOuGerarPixFn(cobrancaId);

              if (
                modoEfetivo === ModoCobrancaEnum.AUTOMATICA &&
                !pixInfo?.pixCopiaCola &&
                !pixInfo?.boletoLinhaDigitavel
              ) {
                logger.warn(
                  { cobrancaId, passageiroId: passageiro?.id },
                  "[CobrancaNotificacaoService] Notificação de cobrança automática suspensa: Pix não pôde ser gerado"
                );
                return null;
              }
            } else if (
              modoEfetivo === ModoCobrancaEnum.AUTOMATICA &&
              !c.pix_copia_cola &&
              !c.boleto_linha_digitavel
            ) {
              await addPixWarmupToGenerationQueue(cobrancaId);
            }

            const valorFinal = pixInfo ? pixInfo.valorTotalPix : Number(c.valor);
            const isModoLembrete = modoEfetivo === ModoCobrancaEnum.LEMBRETES;

            const pixResolvidoLembrete = isModoLembrete
              ? cobrancaCalculoService.resolverPixEfetivo({
                  passageiro: passageiro as Record<string, unknown>,
                  motoristaConfig: motoristaConfigFin,
                })
              : null;

            const context = {
              nomeResponsavel: resp.nome,
              nomePassageiro: passageiro?.nome || "Aluno",
              nomeMotorista: getDriverDisplayName(motorista),
              apelidoMotorista: motorista?.apelido || undefined,
              telefoneMotorista: motorista?.telefone || undefined,
              valor: valorFinal,
              dataVencimento: dataVencimentoStr,
              diasAntecedencia,
              diasAtraso:
                eventType === EVENTO_PASSAGEIRO_ATRASADO ? diffInDays(dataVencimentoStr, todayStr) : undefined,
              usuarioId,
              passageiroId: passageiro?.id,
              chavePix: isModoLembrete ? pixResolvidoLembrete?.chave || undefined : undefined,
              tipoChavePix: isModoLembrete ? pixResolvidoLembrete?.tipo || undefined : undefined,
              pixCopiaCola: pixInfo?.pixCopiaCola,
              pixQrCodeUrl: pixInfo?.pixQrCodeUrl,
              boletoLinhaDigitavel: pixInfo?.boletoLinhaDigitavel,
              boletoUrl: pixInfo?.boletoUrl,
              boletoNossoNumero: pixInfo?.boletoNossoNumero,
              mes: Number(c.mes),
              ano: Number(c.ano),
              cobrancaId,
            };

            const success = await notificationService.notifyPassenger(
              resp.telefone || resp.email || "",
              eventType,
              context,
              {
                channels: activeChannels,
                usuarioId,
                passageiroId: passageiro?.id,
                email: resp.email || undefined,
                metadata: { cobrancaId },
              }
            );

            if (success) {
              return cobrancaId;
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error(
              { err: msg, cobrancaId },
              "[CobrancaNotificacaoService] Falha ao enviar notificação de cobrança individual"
            );
          }

          return null;
        });

        const chunkOutcomes = await Promise.allSettled(chunkPromises);
        for (const outcome of chunkOutcomes) {
          if (outcome.status === "fulfilled" && outcome.value) {
            successfulIdsInChunk.push(outcome.value);
          }
        }

        if (successfulIdsInChunk.length > 0) {
          sentCount += successfulIdsInChunk.length;
          await cobrancaRepository.updateBulkUltimaNotificacao(successfulIdsInChunk, todayStr);
        }

        if (chunkExecutedExternalAction && i + BATCH_SIZE < cobrancas.length) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
      }

      await historicoRepository.deleteFalhasIntegracaoCobrancasResolvidas();
      logger.info({ sentCount }, "[CobrancaNotificacaoService] Envio diário de notificações de cobrança concluído.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "[CobrancaNotificacaoService] Erro crítico no processo de notificações de cobrança");
    }
  },
};
