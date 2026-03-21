import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import { RegistrarPagamentoManualDTO } from "../types/dtos/cobranca.dto.js";
import { AtividadeAcao, AtividadeEntidadeTipo, CobrancaStatus, CobrancaTipoPagamento } from "../types/enums.js";
import { cobrancaService } from "./cobranca.service.js";
import { historicoService } from "./historico.service.js";

import crypto from "node:crypto";
import { toLocalDateString } from "../utils/date.utils.js";

interface PagamentoInfo {
    horario?: string | Date;
    [key: string]: any;
}

export const cobrancaPagamentoService = {
  


  /**
   * Registra um pagamento manual feito pelo motorista.
   * ATENÇÃO: Se a cobrança tiver um PIX ativo, tenta cancelar ANTES de salvar.
   */
  async registrarPagamentoManual(cobrancaId: string, data: RegistrarPagamentoManualDTO): Promise<any> {
      logger.info({ cobrancaId }, "[cobrancaPagamentoService.registrarPagamentoManual] Iniciando registro");

      const { data: cobranca, error: findError } = await supabaseAdmin
          .from("cobrancas")
          .select("*, passageiro:passageiros(nome_responsavel, cpf_responsavel)")
          .eq("id", cobrancaId)
          .single();

      if (findError || !cobranca) throw new AppError("Cobrança não encontrada.", 404);
      if (cobranca.status === CobrancaStatus.PAGO) throw new AppError("Esta cobrança já está paga.", 400);

      // Cancelamento de PIX desativado conforme plano base.

      // 2. REGISTRAR NO BANCO
      const { data: updated, error } = await supabaseAdmin
          .from("cobrancas")
          .update({
              status: CobrancaStatus.PAGO,
              pagamento_manual: true,
              tipo_pagamento: data.tipo_pagamento || CobrancaTipoPagamento.DINHEIRO,
              data_pagamento: data.data_pagamento || new Date(),
              valor_pago: data.valor_pago || cobranca.valor,
          })
          .eq("id", cobrancaId)
          .select()
          .single();

      if (error) throw new AppError(`Erro ao registrar pagamento: ${error.message}`, 500);

      historicoService.log({
          usuario_id: cobranca.usuario_id,
          entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
          entidade_id: cobrancaId,
          acao: AtividadeAcao.PAGAMENTO_MANUAL,
          descricao: `Pagamento manual de ${updated.mes}/${updated.ano} (${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(updated.valor_pago)}) do passageiro ${cobranca.passageiro?.nome || cobranca.passageiros?.nome} registrado.`,
          meta: {
              valor_pago: updated.valor_pago,
              tipo_pagamento: updated.tipo_pagamento,
              data_pagamento: updated.data_pagamento,
              passageiro: cobranca.passageiro?.nome || cobranca.passageiros?.nome
          }
      });

      return updated;
  },

  async desfazerPagamento(cobrancaId: string): Promise<any> {
    logger.info({ cobrancaId }, "[cobrancaPagamentoService.desfazerPagamento] Iniciando reversão de pagamento manual");

    const { data: cobranca, error: findError } = await supabaseAdmin
      .from("cobrancas")
      .select("*, passageiro:passageiros(*, escola:escolas(nome), veiculo:veiculos(placa))")
      .eq("id", cobrancaId)
      .single();

    if (findError || !cobranca) {
      throw new AppError("Cobrança não encontrada.", 404);
    }

    if (!cobranca.pagamento_manual) {
      throw new AppError("Não é permitido desfazer este pagamento: apenas recebimentos marcados manualmente pelo motorista podem ser revertidos.", 400);
    }

    // Regeneração de PIX desativada conforme plano base.
    const pixData = {};

    const { data, error } = await supabaseAdmin
      .from("cobrancas")
      .update({
        status: CobrancaStatus.PENDENTE,
        data_pagamento: null,
        valor_pago: null,
        tipo_pagamento: null,
        pagamento_manual: false,
        recibo_url: null,
        dados_auditoria_pagamento: null,
        ...pixData // Injeta os novos dados do PIX
      })
      .eq("id", cobrancaId)
      .select()
      .single();

    if (error) {
      logger.error({ error, cobrancaId }, "Erro ao desfazer pagamento da cobrança");
      throw new AppError("Erro ao desfazer pagamento.", 500);
    }

    // Notificação de reabertura manual desativada ou simplificada conforme plano base.
    cobrancaService.enviarNotificacaoManual(cobrancaId).catch(err => {
        logger.error({ err, cobrancaId }, "Falha ao enviar notificação manual após desfazer pagamento.");
    });

    // --- LOG DE AUDITORIA ---
    historicoService.log({
        usuario_id: cobranca.usuario_id,
        entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
        entidade_id: cobrancaId,
        acao: AtividadeAcao.PAGAMENTO_REVERTIDO,
        descricao: `Pagamento de ${cobranca.mes}/${cobranca.ano} do passageiro ${cobranca.passageiro?.nome || cobranca.passageiros?.nome} desfeito pelo motorista.`,
        meta: { 
          cobranca_id: cobrancaId,
          passageiro: cobranca.passageiro?.nome || cobranca.passageiros?.nome,
          mes: cobranca.mes,
          ano: cobranca.ano,
          valor: cobranca.valor
        }
    });

    return data;
  },

  async iniciarRepasse(cobrancaId: string): Promise<any> {
    logger.warn({ cobrancaId }, "[cobrancaPagamentoService.iniciarRepasse] Recurso de repasse DESATIVADO no plano base.");
    return { success: false, reason: "recurso_desativado" };
  },

  async reprocessarRepassesPendentes(usuarioId: string): Promise<{ retried: number }> {
    return { retried: 0 };
  }
};
