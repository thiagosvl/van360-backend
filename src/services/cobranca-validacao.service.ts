import { cobrancaRepasseRepository } from "../repositories/cobranca-repasse.repository.js";
import { cobrancaRepository } from "../repositories/cobranca.repository.js";
import { motoristaFinanceiroRepository } from "../repositories/motorista-financeiro.repository.js";
import { historicoRepository } from "../repositories/historico.repository.js";
import { supabaseAdmin } from "../config/supabase.js";
import { paymentService } from "./payments/payment.service.js";
import { CobrancaStatus, PaymentProvider, ProvedorPagamentoEnum, StatusRepasseEnum } from "../types/enums.js";
import { AppError } from "../errors/AppError.js";
import { logger } from "../config/logger.js";

export const cobrancaValidacaoService = {
  async validarImpedimentoPorRepasse(
    cobrancaId: string,
    cobranca: { repasse_em_processamento?: boolean | null } | null | undefined,
    acao: string
  ): Promise<void> {
    if (cobranca?.repasse_em_processamento) {
      throw new AppError(`Não é possível ${acao}: esta cobrança está com repasse automático em processamento via Pix.`, 400);
    }

    const repasse = await cobrancaRepasseRepository.getByCobrancaId(cobrancaId);
    if (repasse && (repasse.status_repasse === StatusRepasseEnum.SUCESSO || repasse.status_repasse === StatusRepasseEnum.PROCESSANDO)) {
      throw new AppError(`Não é possível ${acao}: esta cobrança possui repasse automático liquidado ou em processamento.`, 400);
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
            ...options
          });
        } else {
          await paymentService.cancelCharge(resolvedProvedorId, PaymentProvider.WOOVI, options);
        }
      } catch (err: unknown) {
        logger.warn({ error: err, cobrancaId, provedorCobrancaId: resolvedProvedorId }, "[CobrancaValidacaoService] Falha ao cancelar cobrança no provedor");
      }
    }

    await cobrancaRepository.limparDadosPix(cobrancaId);
  },

  async invalidarPixCobrancasPendentesPorPassageiro(passageiroId: string, limparFalhasHistorico = false): Promise<void> {
    try {
      const { data: cobrancas } = await supabaseAdmin
        .from("cobrancas")
        .select("id, provedor_cobranca_id, provedor")
        .eq("passageiro_id", passageiroId)
        .eq("status", CobrancaStatus.PENDENTE);

      if (!cobrancas || cobrancas.length === 0) return;

      for (const cob of cobrancas) {
        if (cob.provedor_cobranca_id) {
          await this.cancelarPixCobrancaSeExistir(cob.id, cob.provedor_cobranca_id, cob.provedor);
        }
        if (limparFalhasHistorico) {
          void historicoRepository.deleteFalhaIntegracaoByEntidadeId(cob.id);
        }
      }
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

      for (const cob of cobrancas) {
        const pass = Array.isArray(cob.passageiro) ? cob.passageiro[0] : cob.passageiro;
        if (pass?.chave_pix) continue;
        if (cob.provedor_cobranca_id) {
          await this.cancelarPixCobrancaSeExistir(cob.id, cob.provedor_cobranca_id, cob.provedor);
        }
      }
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

      for (const cob of cobrancas) {
        if (cob.provedor_cobranca_id) {
          await this.cancelarPixCobrancaSeExistir(cob.id, cob.provedor_cobranca_id, cob.provedor);
        }
      }
    } catch (err: unknown) {
      logger.warn({ error: err, usuarioId }, "[CobrancaValidacaoService] Erro ao invalidar Pix pendentes do motorista");
    }
  }
};
