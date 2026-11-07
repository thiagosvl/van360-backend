import { cobrancaRepasseRepository } from "../repositories/cobranca-repasse.repository.js";
import { cobrancaRepository } from "../repositories/cobranca.repository.js";
import { motoristaFinanceiroRepository } from "../repositories/motorista-financeiro.repository.js";
import { historicoRepository } from "../repositories/historico.repository.js";
import { supabaseAdmin } from "../config/supabase.js";
import { paymentService } from "./payments/payment.service.js";
import { CobrancaStatus, PaymentProvider, ProvedorPagamentoEnum, StatusRepasseEnum } from "../types/enums.js";
import { AppError } from "../errors/AppError.js";
import { logger } from "../config/logger.js";

interface CobrancaProvedorItem {
  id: string;
  provedor_cobranca_id?: string | null;
  provedor?: string | null;
}

const cancelProviderChargesInBackground = (items: CobrancaProvedorItem[]): void => {
  const validItems = items.filter((i) => Boolean(i.provedor_cobranca_id));
  if (validItems.length === 0) return;

  void (async () => {
    for (let idx = 0; idx < validItems.length; idx++) {
      const item = validItems[idx];
      if (!item.provedor_cobranca_id) continue;
      try {
        const isBB =
          item.provedor === PaymentProvider.BANCO_DO_BRASIL ||
          item.provedor === ProvedorPagamentoEnum.BANCO_DO_BRASIL;
        await paymentService.cancelCharge(
          item.provedor_cobranca_id,
          isBB ? PaymentProvider.BANCO_DO_BRASIL : PaymentProvider.WOOVI
        );
      } catch (err: unknown) {
        logger.warn(
          { error: err, cobrancaId: item.id, provedorCobrancaId: item.provedor_cobranca_id },
          "[CobrancaValidacaoService] Falha ao cancelar cobrança em lote no provedor"
        );
      }
      if (idx + 1 < validItems.length) {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
  })();
};

export const cobrancaValidacaoService = {
  async validarImpedimentoPorRepasse(
    cobrancaId: string,
    cobranca: { repasse_em_processamento?: boolean | null } | null | undefined,
    acao: string
  ): Promise<void> {
    if (cobranca?.repasse_em_processamento) {
      throw new AppError(
        `Não é possível ${acao}: esta cobrança está com repasse automático em processamento via Pix.`,
        400
      );
    }

    const repasse = await cobrancaRepasseRepository.getByCobrancaId(cobrancaId);
    if (
      repasse &&
      (repasse.status_repasse === StatusRepasseEnum.SUCESSO ||
        repasse.status_repasse === StatusRepasseEnum.PROCESSANDO)
    ) {
      throw new AppError(
        `Não é possível ${acao}: esta cobrança possui repasse automático liquidado ou em processamento.`,
        400
      );
    }
  },

  async cancelarPixCobrancaSeExistir(
    cobrancaId: string,
    provedorCobrancaId?: string | null,
    provedor?: PaymentProvider | ProvedorPagamentoEnum | string | null,
    options?: Record<string, unknown>
  ): Promise<void> {
    let resolvedProvedor = provedor;
    let resolvedProvedorId = provedorCobrancaId;
    let usuarioId: string | null = null;
    let nossoNumero: string | null = null;

    if (!resolvedProvedor || !resolvedProvedorId) {
      const { data: cobranca } = await cobrancaRepository.getById(cobrancaId);
      if (cobranca) {
        resolvedProvedor = resolvedProvedor || cobranca.provedor;
        resolvedProvedorId = resolvedProvedorId || cobranca.provedor_cobranca_id;
        usuarioId = cobranca.usuario_id;
        nossoNumero = cobranca.boleto_nosso_numero;
      }
    }

    await cobrancaRepository.limparDadosPix(cobrancaId);

    if (resolvedProvedorId) {
      try {
        const isBancoDoBrasil =
          resolvedProvedor === PaymentProvider.BANCO_DO_BRASIL ||
          resolvedProvedor === ProvedorPagamentoEnum.BANCO_DO_BRASIL;

        if (isBancoDoBrasil) {
          let numeroConvenio: number | undefined;
          if (usuarioId) {
            const configFin = await motoristaFinanceiroRepository.getByUsuarioId(usuarioId);
            const provConfig = configFin?.provedor_config as Record<string, unknown> | null;
            if (provConfig?.convenio) {
              numeroConvenio = Number(provConfig.convenio);
            }
          }
          await paymentService.cancelCharge(resolvedProvedorId, PaymentProvider.BANCO_DO_BRASIL, {
            numeroConvenio,
            nossoNumero,
            ...options,
          });
        } else {
          await paymentService.cancelCharge(resolvedProvedorId, PaymentProvider.WOOVI, options);
        }
      } catch (err: unknown) {
        logger.warn(
          { error: err, cobrancaId, provedorCobrancaId: resolvedProvedorId },
          "[CobrancaValidacaoService] Falha ao cancelar cobrança no provedor"
        );
      }
    }
  },

  async invalidarPixCobrancasPendentesPorPassageiro(
    passageiroId: string,
    limparFalhasHistorico = false
  ): Promise<void> {
    try {
      const { data: cobrancas } = await supabaseAdmin
        .from("cobrancas")
        .select("id, provedor_cobranca_id, provedor, pix_copia_cola")
        .eq("passageiro_id", passageiroId)
        .eq("status", CobrancaStatus.PENDENTE);

      if (!cobrancas || cobrancas.length === 0) return;

      const comPixIds = cobrancas
        .filter((c) => Boolean(c.provedor_cobranca_id || c.pix_copia_cola))
        .map((c) => c.id);

      if (comPixIds.length > 0) {
        await cobrancaRepository.limparDadosPixBulk(comPixIds);
      }

      if (limparFalhasHistorico) {
        await Promise.all(cobrancas.map((c) => historicoRepository.deleteFalhaIntegracaoByEntidadeId(c.id)));
      }

      cancelProviderChargesInBackground(cobrancas);
    } catch (err: unknown) {
      logger.warn({ error: err, passageiroId }, "[CobrancaValidacaoService] Erro ao invalidar Pix pendentes do aluno");
    }
  },

  async invalidarPixCobrancasPendentesPorVeiculo(veiculoId: string): Promise<void> {
    try {
      const { data: cobrancas } = await supabaseAdmin
        .from("cobrancas")
        .select("id, provedor_cobranca_id, provedor, passageiro:passageiros!inner(veiculo_id, chave_pix)")
        .eq("passageiro.veiculo_id", veiculoId)
        .eq("status", CobrancaStatus.PENDENTE)
        .not("provedor_cobranca_id", "is", null);

      if (!cobrancas || cobrancas.length === 0) return;

      const elegiveis = cobrancas.filter((cob) => {
        const pass = Array.isArray(cob.passageiro) ? cob.passageiro[0] : cob.passageiro;
        return !pass?.chave_pix;
      });

      if (elegiveis.length === 0) return;

      await cobrancaRepository.limparDadosPixBulk(elegiveis.map((c) => c.id));
      cancelProviderChargesInBackground(elegiveis);
    } catch (err: unknown) {
      logger.warn({ error: err, veiculoId }, "[CobrancaValidacaoService] Erro ao invalidar Pix pendentes do veículo");
    }
  },

  async invalidarPixCobrancasPendentesPorMotorista(
    usuarioId: string,
    options?: { apenasSemExcecaoModo?: boolean }
  ): Promise<void> {
    try {
      let query = supabaseAdmin
        .from("cobrancas")
        .select("id, provedor_cobranca_id, provedor, passageiro:passageiros!inner(modo_cobranca)")
        .eq("usuario_id", usuarioId)
        .eq("status", CobrancaStatus.PENDENTE)
        .not("provedor_cobranca_id", "is", null);

      if (options?.apenasSemExcecaoModo) {
        query = query.is("passageiro.modo_cobranca", null);
      }

      const { data: cobrancas } = await query;
      if (!cobrancas || cobrancas.length === 0) return;

      await cobrancaRepository.limparDadosPixBulk(cobrancas.map((c) => c.id));
      cancelProviderChargesInBackground(cobrancas);
    } catch (err: unknown) {
      logger.warn(
        { error: err, usuarioId },
        "[CobrancaValidacaoService] Erro ao invalidar Pix pendentes do motorista"
      );
    }
  },
};
