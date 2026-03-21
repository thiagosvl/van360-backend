import crypto from "node:crypto";
import { PASSENGER_EVENT_MANUAL } from "../config/constants.js";
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import { moneyToNumber } from "../utils/currency.utils.js";
import { toLocalDateString } from "../utils/date.utils.js";
import { notificationService } from "./notifications/notification.service.js";

import { CreateCobrancaDTO } from "../types/dtos/cobranca.dto.js";
import { AtividadeAcao, AtividadeEntidadeTipo, CobrancaOrigem } from "../types/enums.js";
import { historicoService } from "./historico.service.js";

interface CreateCobrancaOptions {
  skipLog?: boolean;       // Se true, não registra log individual de auditoria
}

export const cobrancaService = {
  async countByPassageiro(passageiroId: string): Promise<number> {
    const { count, error } = await supabaseAdmin
      .from("cobrancas")
      .select("id", { count: "exact", head: true })
      .eq("passageiro_id", passageiroId);

    if (error) throw error;
    return count || 0;
  },

  async createCobranca(data: CreateCobrancaDTO, options: CreateCobrancaOptions = {}): Promise<any> {
    if (!data.passageiro_id || !data.usuario_id) throw new AppError("Campos obrigatórios ausentes (passageiro_id, usuario_id).", 400);

    // Buscar dados do passageiro para gerar PIX (CPF e Nome do Responsável)
    const { data: passageiro, error: passError } = await supabaseAdmin
      .from("passageiros")
      .select("cpf_responsavel, nome_responsavel")
      .eq("id", data.passageiro_id)
      .single();

    if (passError || !passageiro) throw new AppError("Passageiro não encontrado para gerar cobrança.", 404);

    // Gerar ID preliminar
    const cobrancaId = crypto.randomUUID();

    // Geração de PIX desativada conforme plano base.
    const pixData = {};
    const valorNumerico = typeof data.valor === "string" ? moneyToNumber(data.valor) : data.valor;

    // Inserir no Banco
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { enviar_notificacao_agora, tipo, ...cobrancaCleanData } = data;

    const cobrancaData: any = {
      id: cobrancaId,
      ...cobrancaCleanData,
      valor: valorNumerico,
      ...pixData
    };

    const { data: inserted, error } = await supabaseAdmin
      .from("cobrancas")
      .insert([cobrancaData])
      .select("*, passageiros(nome)")
      .single();

    if (error) throw new AppError(`Erro ao criar cobrança no banco: ${error.message}`, 500);

    // --- LOG DE AUDITORIA ---
    if (!options.skipLog) {
      historicoService.log({
        usuario_id: inserted.usuario_id,
        entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
        entidade_id: inserted.id,
        acao: AtividadeAcao.COBRANCA_CRIADA,
        descricao: `Cobrança de ${inserted.mes}/${inserted.ano} do passageiro ${(inserted as any).passageiros?.nome} criada (${inserted.origem === 'automatica' ? 'Automática' : 'Manual'}).`,
        meta: {
          valor: inserted.valor,
          vencimento: inserted.data_vencimento,
          origem: inserted.origem,
          passageiro: (inserted as any).passageiros?.nome
        }
      });
    }

    // Enviar notificação imediata se solicitado
    if (data.enviar_notificacao_agora) {
      // Roda em background para não travar response
      this.enviarNotificacaoManual(inserted.id).catch(err => {
        logger.error({ err, cobrancaId: inserted.id }, "Falha ao enviar notificação imediata após criação.");
      });
    }

    return inserted;
  },



  async updateCobranca(id: string, data: Partial<any>, cobrancaOriginal?: any): Promise<any> {
    if (!id) throw new AppError("ID da cobrança é obrigatório", 400);

    // Buscar cobrança original se não foi fornecida
    if (!cobrancaOriginal) {
      cobrancaOriginal = await this.getCobranca(id);
    }

    const cobrancaData: any = {};

    // Mapeamento de campos permitidos para edição de metadados
    if (data.valor !== undefined) cobrancaData.valor = data.valor;
    if (data.data_vencimento !== undefined) cobrancaData.data_vencimento = data.data_vencimento;
    
    // Bloqueio de transição de status via PUT (Diretrizes de Arquitetura)
    if (data.status !== undefined && data.status !== cobrancaOriginal.status) {
      logger.warn({ cobrancaId: id, from: cobrancaOriginal.status, to: data.status }, "Tentativa de alteração de status via PUT (updateCobranca) ignorada. Use os endpoints especializados.");
    }

    if (data.tipo_pagamento !== undefined) cobrancaData.tipo_pagamento = data.tipo_pagamento;
    if (data.data_pagamento !== undefined) cobrancaData.data_pagamento = data.data_pagamento;
    if (data.valor_pago !== undefined) cobrancaData.valor_pago = moneyToNumber(data.valor_pago);

    // Lógica de regeneração de PIX removida conforme diretrizes do plano base.
    let shouldResendNotification = false;

    const { data: updated, error } = await supabaseAdmin
      .from("cobrancas")
      .update(cobrancaData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new AppError(`Erro ao atualizar cobrança: ${error.message}`, 500);

    // --- LOG DE AUDITORIA ---
    historicoService.log({
      usuario_id: cobrancaOriginal.usuario_id,
      entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
      entidade_id: id,
      acao: AtividadeAcao.COBRANCA_EDITADA,
      descricao: `Cobrança de ${cobrancaOriginal.mes}/${cobrancaOriginal.ano} do passageiro ${cobrancaOriginal.passageiros?.nome || cobrancaOriginal.passageiro?.nome} editada pelo motorista.`,
      meta: {
        antes: { valor: cobrancaOriginal.valor, vencimento: cobrancaOriginal.data_vencimento },
        depois: { valor: updated.valor, vencimento: updated.data_vencimento },
        passageiro: cobrancaOriginal.passageiros?.nome || cobrancaOriginal.passageiro?.nome
      }
    });

    // 4. Reenviar notificação se necessário (Após save do DB para garantir leitura correta)
    if (shouldResendNotification) {
      // Executar em background para não travar a resposta HTTP
      this.enviarNotificacaoManual(id).catch(err => {
        logger.error({ err, cobrancaId: id }, "Falha ao reenviar notificação automática pós-edição.");
      });
    }

    return updated;
  },

  async getCobranca(id: string): Promise<any> {
    const { data, error } = await supabaseAdmin
      .from("cobrancas")
      .select("*, passageiro:passageiros(*, escola:escolas(nome), veiculo:veiculos(placa))")
      .eq("id", id)
      .single();

    if (error) throw new AppError("Cobrança não encontrada.", 404);

    return data;
  },

  async deleteCobranca(id: string): Promise<void> {
    // 1. Buscar dados antes de deletar (p/ log e cancelamento)
    const { data: cobranca, error: fetchError } = await supabaseAdmin
      .from("cobrancas")
      .select("*, passageiros(nome)")
      .eq("id", id)
      .single();

    if (fetchError || !cobranca) {
      logger.error({ error: fetchError?.message, cobrancaId: id }, "Erro ao buscar cobrança para exclusão.");
      throw new AppError("Erro ao buscar cobrança para exclusão.", 500);
    }

    // Cancelamento de PIX removido conforme diretrizes do plano base.

    // 3. Deletar do Banco
    const { error } = await supabaseAdmin.from("cobrancas").delete().eq("id", id);
    if (error) throw new AppError("Erro ao excluir cobrança no banco de dados.", 500);

    // --- LOG DE AUDITORIA ---
    historicoService.log({
      usuario_id: cobranca.usuario_id,
      entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
      entidade_id: id,
      acao: AtividadeAcao.COBRANCA_EXCLUIDA,
      descricao: `Mensalidade de ${cobranca.mes}/${cobranca.ano} do passageiro ${(cobranca as any).passageiros?.nome} foi removida.`,
      meta: {
        valor: cobranca.valor,
        mes: cobranca.mes,
        ano: cobranca.ano,
        backup: cobranca // Guarda o estado final antes da deleção física
      }
    });
  },

  async listCobrancasWithFilters(filtros: any): Promise<any[]> {
    let query = supabaseAdmin
      .from("cobrancas")
      .select("*, passageiro:passageiros!inner(nome, nome_responsavel)")
      .order("data_vencimento", { ascending: false });

    if (filtros.usuarioId) query = query.eq("usuario_id", filtros.usuarioId);
    if (filtros.passageiroId) query = query.eq("passageiro_id", filtros.passageiroId);
    if (filtros.status) query = query.eq("status", filtros.status);
    if (filtros.dataInicio) query = query.gte("data_vencimento", filtros.dataInicio);
    if (filtros.dataFim) query = query.lte("data_vencimento", filtros.dataFim);

    if (filtros.mes && filtros.ano) {
      const start = new Date(filtros.ano, filtros.mes - 1, 1);
      const endObj = new Date(filtros.ano, filtros.mes, 0);
      const startStr = toLocalDateString(start);
      const endStr = toLocalDateString(endObj);

      query = query.gte("data_vencimento", startStr);
      query = query.lte("data_vencimento", endStr);
    }

    if (filtros.search) {
      query = query.or(`nome.ilike.%${filtros.search}%,nome_responsavel.ilike.%${filtros.search}%`, { foreignTable: 'passageiro' });
    }

    const { data, error } = await query;
    if (error) throw error;
    
    return data;
  },

  async listCobrancasByPassageiro(passageiroId: string, ano?: string): Promise<any[]> {
    let query = supabaseAdmin
      .from("cobrancas")
      .select("*, passageiro:passageiros!inner(nome, nome_responsavel)")
      .eq("passageiro_id", passageiroId)
      .order("data_vencimento", { ascending: false });

    if (ano) {
      query = query.eq("ano", parseInt(ano));
    }

    const { data, error } = await query;
    if (error) throw error;

    return data;
  },

  async listAvailableYearsByPassageiro(passageiroId: string): Promise<number[]> {
    const { data, error } = await supabaseAdmin
      .from("cobrancas")
      .select("ano")
      .eq("passageiro_id", passageiroId)
      .order("ano", { ascending: false });

    if (error) throw error;

    // Extrair anos únicos
    const anos = Array.from(new Set(data?.map((c: any) => c.ano) || [])).sort((a, b) => b - a) as number[];
    return anos;
  },

  async toggleNotificacoes(cobrancaId: string, novoStatus: boolean): Promise<boolean> {
    const { data, error } = await supabaseAdmin
      .from("cobrancas")
      .update({ desativar_lembretes: novoStatus })
      .eq("id", cobrancaId)
      .select("desativar_lembretes, usuario_id")
      .single();

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

    // 1. Buscar Passageiros Ativos do Motorista
    const { data: passageiros, error: passError } = await supabaseAdmin
      .from("passageiros")
      .select("id, nome, valor_mensalidade, dia_vencimento, cpf_responsavel, nome_responsavel")
      .eq("usuario_id", motoristaId)
      .eq("ativo", true);

    if (passError) throw passError;
    if (!passageiros) return { created, skipped };

    // 2. Iterar por Passageiro e Gerar Cobrança
    for (const passageiro of passageiros) {
      // Verificar se já existe cobrança para este mês/ano/passageiro
      const { count } = await supabaseAdmin
        .from("cobrancas")
        .select("id", { count: "exact", head: true })
        .eq("passageiro_id", passageiro.id)
        .eq("mes", targetMonth)
        .eq("ano", targetYear);

      if (count && count > 0) {
        skipped++;
        continue;
      }

      // Calcular Vencimento
      const diaVencimento = passageiro.dia_vencimento;
      const lastDayOfMonth = new Date(targetYear, targetMonth, 0).getDate();
      const diaFinal = Math.min(diaVencimento, lastDayOfMonth);
      const dataVencimentoStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(diaFinal).padStart(2, '0')}`;

      const valorCobranca = passageiro.valor_mensalidade;
      if (!valorCobranca || valorCobranca <= 0) continue;

      try {
        await this.createCobranca({
          usuario_id: motoristaId,
          passageiro_id: passageiro.id,
          valor: valorCobranca,
          data_vencimento: dataVencimentoStr,
          origem: CobrancaOrigem.AUTOMATICA
        }, { skipLog: true });

        created++;
      } catch (e) {
        logger.error({ error: e, passageiroId: passageiro.id }, "Erro ao gerar cobrança automática no loop");
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

  async enviarNotificacaoManual(cobrancaId: string): Promise<boolean> {
    // 1. Buscar Cobrança Completa
    const { data: cobranca, error } = await supabaseAdmin
      .from("cobrancas")
      .select(`
              id, valor, data_vencimento, usuario_id,
              passageiros!inner (
                  id, nome, nome_responsavel, telefone_responsavel
              ),
              usuarios!inner ( nome, apelido )
          `)
      .eq("id", cobrancaId)
      .single();

    if (error || !cobranca) throw new Error("Cobrança não encontrada.");

    const passageiro = cobranca.passageiros as any;
    const motorista = cobranca.usuarios as any;
    const nomeMotorista = motorista.apelido || motorista.nome;

    if (!passageiro.telefone_responsavel) throw new Error("Telefone do responsável não cadastrado.");

    // 2. Enviar Notificação (Manual)
    const success = await notificationService.notifyPassenger(
      passageiro.telefone_responsavel,
      PASSENGER_EVENT_MANUAL,
      {
        nomeResponsavel: passageiro.nome_responsavel || "Responsável",
        nomePassageiro: passageiro.nome || "Passageiro",
        nomeMotorista: nomeMotorista || "Motorista",
        apelidoMotorista: motorista.apelido,
        valor: cobranca.valor,
        dataVencimento: cobranca.data_vencimento,

        usuarioId: cobranca.usuario_id
      }
    );

    // 3. Log de Histórico de Atividades
    if (success) {
      // Atualizar data da última notificação na cobrança
      await supabaseAdmin
        .from("cobrancas")
        .update({ data_envio_ultima_notificacao: new Date() })
        .eq("id", cobrancaId);

      // --- LOG DE AUDITORIA ---
      historicoService.log({
          usuario_id: cobranca.usuario_id,
          entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
          entidade_id: cobrancaId,
          acao: AtividadeAcao.NOTIFICACAO_WHATSAPP,
          descricao: `Lembrete de cobrança enviado manualmente via WhatsApp para ${passageiro.nome_responsavel}.`,
          meta: { telefone: passageiro.telefone_responsavel, passageiro: passageiro.nome }
      });
    }

    return success;
  },

  // Métodos auxiliares necessários para updateCobranca...


  /**
   * Método desativado no plano base.
   */
  async gerarPixRetroativo(usuarioId: string): Promise<any> {
    return { totalEnfileirados: 0 };
  }
};
