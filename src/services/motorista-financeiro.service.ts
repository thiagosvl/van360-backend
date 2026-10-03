import { motoristaFinanceiroRepository } from "../repositories/motorista-financeiro.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { paymentService } from "./payments/payment.service.js";
import { UpdateMotoristaFinanceiroInput } from "../schemas/motorista-financeiro.schema.js";
import { AppError } from "../errors/AppError.js";
import { logger } from "../config/logger.js";
import { ModalidadeCobrancaEnum, BaasStatusEnum } from "../types/enums.js";
import { isDriverInBaaSWhitelist } from "../utils/feature-flag.utils.js";
import type { Tables } from "../types/database.types.js";

type MotoristaConfiguracaoFinanceira = Tables<"motorista_configuracoes_financeiras">;

export interface MotoristaFinanceiroDetalhes extends MotoristaConfiguracaoFinanceira {
  taxa_efetiva: number;
}

export const motoristaFinanceiroService = {
  async obterConfiguracoes(usuarioId: string): Promise<MotoristaFinanceiroDetalhes> {
    const config = await motoristaFinanceiroRepository.getByUsuarioId(usuarioId);
    const taxaGlobal = await motoristaFinanceiroRepository.getTaxaPadraoGlobal();

    return {
      ...config,
      taxa_efetiva: config.taxa_personalizada !== null && config.taxa_personalizada !== undefined
        ? Number(config.taxa_personalizada)
        : taxaGlobal
    };
  },

  async atualizarConfiguracoes(
    usuarioId: string,
    input: UpdateMotoristaFinanceiroInput
  ): Promise<MotoristaFinanceiroDetalhes> {
    const configAtual = await motoristaFinanceiroRepository.getByUsuarioId(usuarioId);
    const { data: usuario } = await userRepository.getById(usuarioId);
    const isWhitelisted = isDriverInBaaSWhitelist(usuario);

    const chavePix = input.chave_pix_repasse !== undefined ? input.chave_pix_repasse : configAtual.chave_pix_repasse;
    const cobrancaAtiva = isWhitelisted
      ? (input.cobranca_automatica_ativa !== undefined ? input.cobranca_automatica_ativa : configAtual.cobranca_automatica_ativa)
      : false;

    if (cobrancaAtiva && !chavePix) {
      throw new AppError("Para ativar o recebimento automático, é obrigatório cadastrar uma chave Pix para repasse.", 400);
    }

    if (chavePix && cobrancaAtiva && isWhitelisted) {
      try {
        await paymentService.ensureSubaccount(chavePix);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ error: msg, chavePix, usuarioId }, "[MotoristaFinanceiroService] Falha ao registrar subconta na instituição financeira");
        throw new AppError(`Erro ao registrar chave Pix para repasse: ${msg}`, 400);
      }
    }

    if (input.chave_pix_repasse !== undefined) {
      try {
        await userRepository.update(usuarioId, {
          chave_pix: input.chave_pix_repasse,
          tipo_chave_pix: input.chave_pix_repasse ? (input.tipo_chave_pix || null) : null
        });
      } catch (userErr: unknown) {
        logger.warn({ error: userErr, usuarioId }, "[MotoristaFinanceiroService] Falha secundária ao sincronizar chave Pix em usuarios");
      }
    }

    let modalidadeFinal: ModalidadeCobrancaEnum;
    if (!cobrancaAtiva) {
      modalidadeFinal = ModalidadeCobrancaEnum.MANUAL;
    } else if (input.modalidade_cobranca === ModalidadeCobrancaEnum.BAAS_CONTA_PROPRIA) {
      modalidadeFinal = configAtual.baas_status === BaasStatusEnum.APROVADO
        ? ModalidadeCobrancaEnum.BAAS_CONTA_PROPRIA
        : ModalidadeCobrancaEnum.SPLIT_SUBCONTA;
    } else {
      modalidadeFinal = input.modalidade_cobranca || (configAtual.baas_status === BaasStatusEnum.APROVADO ? ModalidadeCobrancaEnum.BAAS_CONTA_PROPRIA : ModalidadeCobrancaEnum.SPLIT_SUBCONTA);
    }

    const updated = await motoristaFinanceiroRepository.update(usuarioId, {
      ...input,
      modalidade_cobranca: modalidadeFinal
    });

    const taxaGlobal = await motoristaFinanceiroRepository.getTaxaPadraoGlobal();

    return {
      ...updated,
      taxa_efetiva: updated.taxa_personalizada !== null && updated.taxa_personalizada !== undefined
        ? Number(updated.taxa_personalizada)
        : taxaGlobal
    };
  }
};
