import crypto from "node:crypto";
import { cobrancaRepository } from "../repositories/cobranca.repository.js";
import { passageiroRepository } from "../repositories/passageiro.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { logger } from "../config/logger.js";

import { AppError } from "../errors/AppError.js";
import {
  EVENTO_PASSAGEIRO_COBRANCA_PIX_MANUAL_HOJE,
  EVENTO_PASSAGEIRO_COBRANCA_PIX_MANUAL_AVISO,
  EVENTO_PASSAGEIRO_COBRANCA_PIX_MANUAL_ATRASO
} from "../config/constants.js";
import { moneyToNumber } from "../utils/currency.utils.js";
import { getNowBR, addDays, getLastDayOfMonth, toPersistenceString, diffInDays } from "../utils/date.utils.js";

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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tipo, ...cobrancaCleanData } = data;

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

    // Lógica de regeneração de PIX removida conforme diretrizes do plano base.
    let shouldResendNotification = false;

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
      descricao: `Mensalidade de ${cobranca.mes}/${cobranca.ano} do passageiro ${passageiroNomeDelete} foi removida.`,
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
      descricao: `Lembretes automáticos para esta mensalidade foram ${novoStatus ? 'DESATIVADOS' : 'REATIVADOS'}.`,
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

    // 2. Iterar por Passageiro e Gerar Cobrança
    for (const passageiro of passageiros) {
      // Verificar se já existe cobrança para este mês/ano/passageiro
      const { count } = await cobrancaRepository.countForMesAnoPassageiro(passageiro.id, targetMonth, targetYear);

      if (count && count > 0) {
        skipped++;
        continue;
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

    if (created > 0) {
      // --- LOG DE AUDITORIA ---
      historicoService.log({
        usuario_id: motoristaId,
        entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
        entidade_id: motoristaId,
        acao: AtividadeAcao.COBRANCAS_GERADAS,
        descricao: `Geração automática de ${created} cobranças concluída para ${targetMonth}/${targetYear}.`,
        meta: { mes: targetMonth, ano: targetYear, criadas: created, puladas: skipped }
      });
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

      const { data: cobrancas, error } = await cobrancaRepository.getPendentesParaNotificacao();

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

      for (const c of cobrancas) {
        const passageiro = c.passageiro;
        const motorista = c.motorista;

        if (!passageiro?.telefone_responsavel) continue;
        
        // Verifica a flag global de notificações do passageiro
        if (passageiro?.enviar_notificacoes === false) continue;

        if (!motorista?.chave_pix || !motorista?.tipo_chave_pix) {
          logger.warn({ cobrancaId: c.id, motoristaId: c.usuario_id }, "[CobrancaService] Motorista sem chave Pix configurada. Notificação ignorada.");
          continue;
        }

        const dataVencimentoStr = c.data_vencimento;
        const ultimaNotifStr = c.data_envio_ultima_notificacao;

        let eventType:
          | typeof EVENTO_PASSAGEIRO_COBRANCA_PIX_MANUAL_HOJE
          | typeof EVENTO_PASSAGEIRO_COBRANCA_PIX_MANUAL_AVISO
          | typeof EVENTO_PASSAGEIRO_COBRANCA_PIX_MANUAL_ATRASO
          | null = null;
        let shouldSend = false;

        if (dataVencimentoStr === todayStr) {
          eventType = EVENTO_PASSAGEIRO_COBRANCA_PIX_MANUAL_HOJE;
          if (!ultimaNotifStr || !ultimaNotifStr.startsWith(todayStr)) {
            shouldSend = true;
          }
        } else if (dataVencimentoStr > todayStr && dataVencimentoStr <= thresholdDateStr) {
          eventType = EVENTO_PASSAGEIRO_COBRANCA_PIX_MANUAL_AVISO;
          if (!ultimaNotifStr) {
            shouldSend = true;
          }
        } else if (dataVencimentoStr < todayStr) {
          eventType = EVENTO_PASSAGEIRO_COBRANCA_PIX_MANUAL_ATRASO;
          const daysSinceDue = diffInDays(dataVencimentoStr, now);
          if (daysSinceDue === 3 || daysSinceDue === 5 || daysSinceDue === 7) {
            shouldSend = true;
          }
        }

        if (shouldSend && eventType) {
          try {
            const context = {
              nomeResponsavel: passageiro.nome_responsavel,
              nomePassageiro: passageiro.nome,
              nomeMotorista: motorista.nome,
              apelidoMotorista: motorista.apelido,
              telefoneMotorista: motorista.telefone,
              valor: Number(c.valor),
              dataVencimento: dataVencimentoStr,
              diasAntecedencia: thresholdDays,
              usuarioId: c.usuario_id,
              chavePix: motorista.chave_pix,
              tipoChavePix: motorista.tipo_chave_pix
            };

            const { notificationService } = await import("./notifications/notification.service.js");
            const success = await notificationService.notifyPassenger(
              passageiro.telefone_responsavel,
              eventType,
              context
            );

            if (success) {
              await cobrancaRepository.updateUltimaNotificacao(c.id, new Date().toISOString());

              historicoService.log({
                usuario_id: c.usuario_id,
                entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
                entidade_id: c.id,
                acao: AtividadeAcao.NOTIFICACAO_WHATSAPP,
                descricao: `Notificação de cobrança (${eventType}) enviada para o responsável de ${passageiro.nome}.`,
                meta: { passageiro: passageiro.nome, tipo: eventType }
              });

              sentCount++;
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error({ err: msg, cobrancaId: c.id }, "[CobrancaService] Falha ao enviar notificação de cobrança individual");
          }
        }
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
    // Se hoje for dia >= 20, gera para o mês que vem. Se não, para o mês atual (caso falte alguma).
    const targetMonth = now.getDate() >= 20 ? (now.getMonth() === 11 ? 1 : now.getMonth() + 2) : (now.getMonth() + 1);
    const targetYear = (now.getDate() >= 20 && now.getMonth() === 11) ? now.getFullYear() + 1 : now.getFullYear();

    let totalCreated = 0;

    for (const m of motoristas) {
      const res = await this.gerarCobrancasMensaisParaMotorista(m.id, targetMonth, targetYear);
      totalCreated += res.created;
    }

    return { totalMotoristas: motoristas.length, totalCreated };
  }
};
