import crypto from "node:crypto";
import { cobrancaRepository } from "../repositories/cobranca.repository.js";
import { passageiroRepository } from "../repositories/passageiro.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { logger } from "../config/logger.js";

import { AppError } from "../errors/AppError.js";
import {
  EVENTO_PASSAGEIRO_VENCIMENTO_HOJE,
  EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO,
  EVENTO_PASSAGEIRO_ATRASADO
} from "../config/constants.js";
import { moneyToNumber } from "../utils/currency.utils.js";
import { getNowBR, getLastDayOfMonth, toPersistenceString, diffInDays } from "../utils/date.utils.js";
import { getDriverDisplayName } from "../utils/format.js";

import { CreateCobrancaDTO } from "../types/dtos/cobranca.dto.js";
import { AtividadeAcao, AtividadeEntidadeTipo, CobrancaOrigem, CobrancaStatus, ConfigKey } from "../types/enums.js";
import { historicoService } from "./historico.service.js";
import { receiptService } from "./receipt.service.js";
import { getConfigNumber } from "./configuracao.service.js";

interface CreateCobrancaOptions {
  skipLog?: boolean;
}

export const cobrancaService = {
  async countByPassageiro(passageiroId: string): Promise<number> {
    const { count, error } = await cobrancaRepository.countByPassageiro(passageiroId);

    if (error) throw error;
    return count || 0;
  },

  async createCobranca(data: CreateCobrancaDTO, options: CreateCobrancaOptions = {}): Promise<any> {
    if (!data.passageiro_id || !data.usuario_id) throw new AppError("Campos obrigatórios ausentes (passageiro_id, usuario_id).", 400);

    const { data: passageiro, error: passError } = await passageiroRepository.getResponsavelInfo(data.passageiro_id);

    if (passError || !passageiro) throw new AppError("Passageiro não encontrado para gerar cobrança.", 404);

    const cobrancaId = crypto.randomUUID();
    const valorNumerico = typeof data.valor === "string" ? moneyToNumber(data.valor) : data.valor;

    const { enviar_recibo_whatsapp, ...cobrancaCleanData } = data;

    const cobrancaData: Record<string, unknown> = {
      id: cobrancaId,
      ...cobrancaCleanData,
      valor: valorNumerico,
      data_vencimento: data.data_vencimento ? toPersistenceString(data.data_vencimento) : undefined,
    };

    const { data: inserted, error } = await cobrancaRepository.insert(cobrancaData);

    if (error) throw new AppError(`Erro ao criar cobrança no banco: ${error.message}`, 500);

    // --- LOG DE AUDITORIA ---
    if (!options.skipLog) {
      const passageiroNome = (inserted as Record<string, any>).passageiros?.nome || (inserted as Record<string, any>).passageiro?.nome;
      historicoService.log({
        usuario_id: inserted.usuario_id,
        entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
        entidade_id: inserted.id,
        acao: AtividadeAcao.COBRANCA_CRIADA,
        descricao: `Cobrança de ${inserted.mes}/${inserted.ano} do passageiro ${passageiroNome} criada (${inserted.origem === 'automatica' ? 'Automática' : 'Manual'}).`,
        meta: {
          valor: inserted.valor,
          vencimento: inserted.data_vencimento,
          origem: inserted.origem,
          passageiro: passageiroNome
        }
      });
    }

    // 3. GERAR RECIBO SE JÁ NASCER PAGO
    if (inserted.status === CobrancaStatus.PAGO) {
      try {
        const url = await receiptService.generateForCobranca(inserted.id);
        if (!url) {
          // Rollback: Deletar a cobrança criada pois o recibo falhou
          await cobrancaRepository.delete(inserted.id);
          throw new Error("Não foi possível gerar o recibo para a cobrança paga.");
        }
        inserted.recibo_url = url;

        // Se gerar recibo e não for explicitamente desativado o envio
        if (data.enviar_recibo_whatsapp !== false) {
          try {
            const { data: fullCobranca } = await cobrancaRepository.getByIdWithPassageiroAndMotorista(inserted.id);
            const passageiroInfo = fullCobranca?.passageiro as Record<string, any> | undefined;
            const motoristaInfo = fullCobranca?.motorista as Record<string, any> | undefined;

            if (passageiroInfo?.telefone_responsavel) {
              const { notificationService } = await import("./notifications/notification.service.js");
              const { EVENTO_PASSAGEIRO_RECIBO_PAGAMENTO } = await import("../config/constants.js");
              await notificationService.notifyPassenger(
                passageiroInfo.telefone_responsavel,
                EVENTO_PASSAGEIRO_RECIBO_PAGAMENTO,
                {
                  nomeResponsavel: passageiroInfo.nome_responsavel || passageiroInfo.nome || "",
                  nomePassageiro: passageiroInfo.nome || "",
                  nomeMotorista: getDriverDisplayName(motoristaInfo),
                  apelidoMotorista: motoristaInfo?.apelido,
                  valor: Number(inserted.valor),
                  dataPagamento: inserted.data_pagamento || undefined,
                  mes: inserted.mes,
                  ano: inserted.ano,
                  reciboUrl: inserted.recibo_url,
                  usuarioId: inserted.usuario_id
                },
                { channels: ["WHATSAPP"] }
              );
            }
          } catch (notifErr: unknown) {
            const msg = notifErr instanceof Error ? notifErr.message : String(notifErr);
            logger.error({ error: msg, cobrancaId: inserted.id }, "Erro ao enviar recibo por WhatsApp pós-criação da cobrança já paga");
          }
        }
      } catch (e: unknown) {
        // Rollback manual
        await cobrancaRepository.delete(inserted.id);
        const msg = e instanceof Error ? e.message : String(e);
        logger.error({ error: msg, cobrancaId: inserted.id }, "Erro ao gerar recibo na criação - Cobrança excluída p/ manter consistência");
        throw new AppError(msg || "Erro ao gerar recibo.", 500);
      }
    }

    return inserted;
  },



  async updateCobranca(id: string, data: Partial<CreateCobrancaDTO>, cobrancaOriginal?: Record<string, any>): Promise<any> {
    if (!id) throw new AppError("ID da cobrança é obrigatório", 400);

    // Buscar cobrança original se não foi fornecida
    if (!cobrancaOriginal) {
      cobrancaOriginal = await this.getCobranca(id);
    }

    const cobrancaData: Record<string, unknown> = {};

    // Mapeamento de campos permitidos para edição de metadados
    if (data.valor !== undefined) cobrancaData.valor = data.valor;
    if (data.data_vencimento !== undefined) cobrancaData.data_vencimento = data.data_vencimento ? toPersistenceString(data.data_vencimento) : undefined;

    // Bloqueio de transição de status via PUT (Diretrizes de Arquitetura)
    if (data.status !== undefined && data.status !== cobrancaOriginal?.status) {
      logger.warn({ cobrancaId: id, from: cobrancaOriginal?.status, to: data.status }, "Tentativa de alteração de status via PUT (updateCobranca) ignorada. Use os endpoints especializados.");
    }

    if (data.tipo_pagamento !== undefined) cobrancaData.tipo_pagamento = data.tipo_pagamento;
    if (data.data_pagamento !== undefined) cobrancaData.data_pagamento = data.data_pagamento;
    if (data.valor_pago !== undefined) cobrancaData.valor_pago = moneyToNumber(data.valor_pago);

    const { data: updated, error } = await cobrancaRepository.update(id, cobrancaData);

    if (error) throw new AppError(`Erro ao atualizar cobrança: ${error.message}`, 500);

    // --- LOG DE AUDITORIA ---
    const passageiroNomeUpdate = cobrancaOriginal?.passageiros?.nome || cobrancaOriginal?.passageiro?.nome;
    historicoService.log({
      usuario_id: cobrancaOriginal?.usuario_id,
      entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
      entidade_id: id,
      acao: AtividadeAcao.COBRANCA_EDITADA,
      descricao: `Cobrança de ${cobrancaOriginal?.mes}/${cobrancaOriginal?.ano} do passageiro ${passageiroNomeUpdate} editada pelo motorista.`,
      meta: {
        antes: { valor: cobrancaOriginal?.valor, vencimento: cobrancaOriginal?.data_vencimento },
        depois: { valor: updated.valor, vencimento: updated.data_vencimento },
        passageiro: passageiroNomeUpdate
      }
    });

    return updated;
  },



  async getCobranca(id: string): Promise<any> {
    const { data, error } = await cobrancaRepository.getById(id);

    if (error) throw new AppError("Cobrança não encontrada.", 404);

    return data;
  },

  async deleteCobranca(id: string): Promise<void> {
    // 1. Buscar dados antes de deletar (p/ log e cancelamento)
    const { data: cobranca, error: fetchError } = await cobrancaRepository.getByIdBasic(id);

    if (fetchError || !cobranca) {
      logger.error({ error: fetchError?.message, cobrancaId: id }, "Erro ao buscar cobrança para exclusão.");
      throw new AppError("Erro ao buscar cobrança para exclusão.", 500);
    }

    // Cancelamento de PIX removido conforme diretrizes do plano base.

    // 3. Deletar do Banco e do Storage
    if (cobranca.recibo_url) {
      await receiptService.deleteReceipt(cobranca.recibo_url);
    }

    const { error } = await cobrancaRepository.delete(id);
    if (error) throw new AppError("Erro ao excluir cobrança no banco de dados.", 500);

    // --- LOG DE AUDITORIA ---
    const passageiroNomeDelete = (cobranca as Record<string, any>).passageiros?.nome || (cobranca as Record<string, any>).passageiro?.nome;
    historicoService.log({
      usuario_id: cobranca.usuario_id,
      entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
      entidade_id: id,
      acao: AtividadeAcao.COBRANCA_EXCLUIDA,
      descricao: `Parcela de ${cobranca.mes}/${cobranca.ano} do passageiro ${passageiroNomeDelete} foi removida.`,
      meta: {
        valor: cobranca.valor,
        mes: cobranca.mes,
        ano: cobranca.ano,
        backup: cobranca // Guarda o estado final antes da deleção física
      }
    });
  },

  async listCobrancasWithFilters(filtros: Record<string, unknown>): Promise<any[]> {
    const { data, error } = await cobrancaRepository.listWithFilters(filtros);
    if (error) throw error;

    return data;
  },

  async listCobrancasByPassageiro(passageiroId: string, ano?: string): Promise<any[]> {
    const { data, error } = await cobrancaRepository.listByPassageiro(passageiroId, ano);
    if (error) throw error;

    return data;
  },



  async toggleNotificacoes(cobrancaId: string, novoStatus: boolean): Promise<boolean> {
    const { data, error } = await cobrancaRepository.toggleNotificacoes(cobrancaId, novoStatus);

    if (error) {
      logger.error({ error, cobrancaId }, "Erro ao alterar status de notificação da cobrança");
      throw new AppError("Erro ao alterar notificações.", 500);
    }

    // --- LOG DE AUDITORIA ---
    historicoService.log({
      usuario_id: data.usuario_id, // Precisamos garantir que usuario_id esteja disponível ou buscar
      entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
      entidade_id: cobrancaId,
      acao: AtividadeAcao.CONFIG_LEMBRETE,
      descricao: `Lembretes automáticos para esta parcela foram ${novoStatus ? 'DESATIVADOS' : 'REATIVADOS'}.`,
      meta: { desativar_lembretes: novoStatus }
    });

    return data.desativar_lembretes;
  },

  async gerarCobrancasMensaisParaMotorista(motoristaId: string, targetMonth: number, targetYear: number): Promise<{ created: number, skipped: number }> {
    let created = 0;
    let skipped = 0;

    // 1. Buscar Passageiros Ativos e Detalhes do Motorista
    const { data: motorista, error: motError } = await userRepository.getMotoristaId(motoristaId);

    if (motError) throw motError;

    const { data: passageiros, error: passError } = await passageiroRepository.listParaCobrancaAutomatica(motoristaId);

    if (passError) throw passError;
    if (!passageiros) return { created, skipped };

    const now = getNowBR();
    const isNextMonthWindow = now.getDate() >= 23;

    // Buscar as cobranças que já foram geradas neste mês/ano para este motorista
    const { data: cobrancasExistentes } = await cobrancaRepository.getByMesAnoParaMotorista(motoristaId, targetMonth, targetYear);
    const passageirosComCobranca = new Set(cobrancasExistentes?.map((c: any) => c.passageiro_id) || []);

    // 2. Iterar por Passageiro e Gerar Cobrança
    for (const passageiro of passageiros) {
      // Verificar se já existe cobrança para este mês/ano/passageiro
      if (passageirosComCobranca.has(passageiro.id)) {
        skipped++;
        continue;
      }

      // Repescagem (antes do dia 23): Ignora passageiros cadastrados neste mesmo mês
      if (!isNextMonthWindow && passageiro.created_at) {
        const passageiroCreatedAt = new Date(passageiro.created_at);
        const startOfCurrentMonth = new Date(targetYear, targetMonth - 1, 1);
        if (passageiroCreatedAt >= startOfCurrentMonth) {
          skipped++;
          continue;
        }
      }

      // Validar Período de Cobrança do Passageiro (timezone-safe)
      const targetDateNum = targetYear * 12 + (targetMonth - 1);

      const getYearMonth = (dateVal: any) => {
        if (!dateVal) return null;
        if (dateVal instanceof Date) {
          return { year: dateVal.getFullYear(), month: dateVal.getMonth() + 1 };
        }
        if (typeof dateVal === 'string') {
          const parts = dateVal.split("-").map(Number);
          if (parts.length >= 2) {
            return { year: parts[0], month: parts[1] };
          }
        }
        return null;
      };

      if (passageiro.data_inicio_cobranca) {
        const ym = getYearMonth(passageiro.data_inicio_cobranca);
        if (ym) {
          const inicioDateNum = ym.year * 12 + (ym.month - 1);
          if (targetDateNum < inicioDateNum) {
            skipped++;
            continue;
          }
        }
      }

      if (passageiro.data_fim_cobranca) {
        const ym = getYearMonth(passageiro.data_fim_cobranca);
        if (ym) {
          const fimDateNum = ym.year * 12 + (ym.month - 1);
          if (targetDateNum > fimDateNum) {
            skipped++;
            continue;
          }
        }
      }

      // Calcular Vencimento
      const diaVencimento = passageiro.dia_vencimento;
      const lastDayOfMonth = getLastDayOfMonth(targetYear, targetMonth);
      const diaFinal = Math.min(diaVencimento, lastDayOfMonth);
      const dataVencimentoStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(diaFinal).padStart(2, '0')}`;

      const valorFinal = Number(passageiro.valor_cobranca);

      if (!valorFinal || valorFinal <= 0) continue;

      try {
        await this.createCobranca({
          usuario_id: motoristaId,
          passageiro_id: passageiro.id,
          valor: valorFinal,
          data_vencimento: dataVencimentoStr,
          origem: CobrancaOrigem.AUTOMATICA,
          mes: targetMonth,
          ano: targetYear
        }, { skipLog: true });

        created++;
      } catch (e: unknown) {
        logger.error({ error: e instanceof Error ? e.message : String(e), passageiroId: passageiro.id, motoristaId, mes: targetMonth, ano: targetYear }, "[CobrancaService] Erro ao gerar cobrança automática no loop");
      }
    }

    return { created, skipped };
  },

  async enviarNotificacoesDiarias() {
    logger.info("[CobrancaService] Iniciando processo diário de notificações de cobrança...");

    try {
      const now = getNowBR();
      const todayStr = toPersistenceString(now);

      const thresholdDays = await getConfigNumber(ConfigKey.PASSAGEIRO_DIAS_AVISO_VENCIMENTO, 2);
      const thresholdDate = getNowBR();
      thresholdDate.setDate(now.getDate() + thresholdDays);
      const thresholdDateStr = toPersistenceString(thresholdDate);

      const targetDates = [todayStr];

      // Aviso (Hoje + 1 até Hoje + thresholdDays)
      for (let i = 1; i <= thresholdDays; i++) {
        const d = getNowBR();
        d.setDate(d.getDate() + i);
        targetDates.push(toPersistenceString(d));
      }

      // Atrasos (Hoje - 3, Hoje - 5, Hoje - 7)
      const atrasos = [3, 5, 7];
      for (const dias of atrasos) {
        const d = getNowBR();
        d.setDate(d.getDate() - dias);
        targetDates.push(toPersistenceString(d));
      }

      const { data: cobrancas, error } = await cobrancaRepository.getPendentesParaNotificacao(targetDates);

      if (error) {
        logger.error({ error: error.message }, "[CobrancaService] Erro ao buscar cobranças pendentes para notificações");
        return;
      }

      if (!cobrancas || cobrancas.length === 0) {
        logger.info("[CobrancaService] Nenhuma cobrança pendente para notificar hoje.");
        return;
      }

      logger.info({ count: cobrancas.length }, "[CobrancaService] Processando notificações para cobranças pendentes...");

      let sentCount = 0;
      const updatedCobrancaIds: string[] = [];

      for (const c of cobrancas) {
        const passageiro = c.passageiro;
        const motorista = c.motorista;

        if (!passageiro?.telefone_responsavel) continue;
        if (passageiro?.enviar_notificacoes === false) continue;

        const dataVencimentoStr = c.data_vencimento;
        const ultimaNotifStr = c.data_envio_ultima_notificacao;
        const lastNotifDateStr = ultimaNotifStr ? toPersistenceString(ultimaNotifStr) : null;

        let eventType:
          | typeof EVENTO_PASSAGEIRO_VENCIMENTO_HOJE
          | typeof EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO
          | typeof EVENTO_PASSAGEIRO_ATRASADO
          | null = null;
        let shouldSend = false;

        if (dataVencimentoStr === todayStr) {
          eventType = EVENTO_PASSAGEIRO_VENCIMENTO_HOJE;
          if (lastNotifDateStr !== todayStr) {
            shouldSend = true;
          }
        } else if (dataVencimentoStr > todayStr && dataVencimentoStr <= thresholdDateStr) {
          eventType = EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO;
          if (!ultimaNotifStr) {
            shouldSend = true;
          }
        } else if (dataVencimentoStr < todayStr) {
          eventType = EVENTO_PASSAGEIRO_ATRASADO;
          const daysSinceDue = diffInDays(dataVencimentoStr, now);
          if (daysSinceDue === 3 || daysSinceDue === 5 || daysSinceDue === 7) {
            if (lastNotifDateStr !== todayStr) {
              shouldSend = true;
            }
          }
        }

        if (shouldSend && eventType) {
          try {
            const context = {
              nomeResponsavel: passageiro.nome_responsavel,
              nomePassageiro: passageiro.nome,
              nomeMotorista: getDriverDisplayName(motorista),
              apelidoMotorista: motorista.apelido,
              telefoneMotorista: motorista.telefone,
              valor: Number(c.valor),
              dataVencimento: dataVencimentoStr,
              diasAntecedencia: eventType === EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO ? diffInDays(now, dataVencimentoStr) : undefined,
              diasAtraso: eventType === EVENTO_PASSAGEIRO_ATRASADO ? diffInDays(dataVencimentoStr, now) : undefined,
              usuarioId: c.usuario_id,
              chavePix: motorista.chave_pix,
              tipoChavePix: motorista.tipo_chave_pix,
              mes: c.mes,
              ano: c.ano
            };

            const { notificationService } = await import("./notifications/notification.service.js");
            const success = await notificationService.notifyPassenger(
              passageiro.telefone_responsavel,
              eventType,
              context,
              { channels: ['WHATSAPP'] }
            );

            if (success) {
              updatedCobrancaIds.push(c.id);

              sentCount++;
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error({ err: msg, cobrancaId: c.id }, "[CobrancaService] Falha ao enviar notificação de cobrança individual");
          }
        }
      }

      if (updatedCobrancaIds.length > 0) {
        await cobrancaRepository.updateBulkUltimaNotificacao(updatedCobrancaIds, toPersistenceString(now));
      }

      logger.info({ sentCount }, "[CobrancaService] Envio diário de notificações de cobrança concluído.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "[CobrancaService] Erro crítico no processo de notificações de cobrança");
    }
  },

  /**
   * Dispara a geração de cobranças para todos os motoristas ativos.
   * Foca no mês atual ou no próximo, dependendo da configuração.
   */
  async gerarCobrancasMensaisParaTodos() {
    logger.info("[CobrancaService] Iniciando geração global de cobranças...");

    // 1. Buscar todos os motoristas ativos (que não sejam admin)
    const { data: motoristas, error } = await userRepository.listMotoristasAtivos();

    if (error) throw error;
    if (!motoristas) return { totalMotoristas: 0 };

    const now = getNowBR();
    // Se hoje for dia >= 23, gera para o mês que vem. Se não, para o mês atual (repescagem segura).
    const targetMonth = now.getDate() >= 23 ? (now.getMonth() === 11 ? 1 : now.getMonth() + 2) : (now.getMonth() + 1);
    const targetYear = (now.getDate() >= 23 && now.getMonth() === 11) ? now.getFullYear() + 1 : now.getFullYear();

    const { addToGenerationQueue } = await import("../queues/generation.queue.js");

    for (const m of motoristas) {
      await addToGenerationQueue({
        motoristaId: m.id,
        mes: targetMonth,
        ano: targetYear
      });
    }

    return { totalMotoristas: motoristas.length, queued: true };
  }
};
