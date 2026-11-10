import type { Json, Tables } from "../types/database.types.js";
import { motoristaFinanceiroRepository } from "../repositories/motorista-financeiro.repository.js";
import { UpdateMotoristaFinanceiroInput } from "../schemas/motorista-financeiro.schema.js";
import { AppError } from "../errors/AppError.js";
import { logger } from "../config/logger.js";
import {
  ModoCobrancaEnum,
  TipoChavePix,
} from "../types/enums.js";
import { supabaseAdmin } from "../config/supabase.js";
import { cobrancaValidacaoService } from "./cobranca-validacao.service.js";
import { pixValidationService } from "./pix-validation.service.js";
import { paymentService } from "./payments/payment.service.js";
import type { ResumoExcecoesModoCobrancaDTO } from "../types/dtos/motorista-financeiro.dto.js";

type MotoristaConfiguracaoFinanceira = Tables<"motorista_configuracoes_financeiras">;

export interface MotoristaFinanceiroDetalhes extends MotoristaConfiguracaoFinanceira {
  taxa_efetiva: number;
}

export const motoristaFinanceiroService = {
  async obterResumoExcecoes(usuarioId: string): Promise<ResumoExcecoesModoCobrancaDTO> {
    return motoristaFinanceiroRepository.getResumoExcecoesModoCobranca(usuarioId);
  },

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

    const chavePix = input.chave_pix_repasse !== undefined ? input.chave_pix_repasse : configAtual.chave_pix_repasse;
    const tipoChavePix = input.tipo_chave_pix !== undefined ? input.tipo_chave_pix : configAtual.tipo_chave_pix;

    if (input.chave_pix_repasse && (tipoChavePix as TipoChavePix)) {
      await pixValidationService.validarDisponibilidadeChavePix({
        chavePix: input.chave_pix_repasse,
        tipoChavePix: tipoChavePix as TipoChavePix,
        usuarioId,
        escopo: "CONTA"
      });
    }

    const modoAnterior: ModoCobrancaEnum =
      (configAtual.modo_cobranca as ModoCobrancaEnum) || ModoCobrancaEnum.DESATIVADO;

    let modoFinal: ModoCobrancaEnum = modoAnterior;

    if (input.modo_cobranca !== undefined) {
      modoFinal = input.modo_cobranca;
    }

    if (modoFinal === ModoCobrancaEnum.AUTOMATICA && !chavePix) {
      throw new AppError("Para ativar a cobrança automática, é obrigatório cadastrar uma chave Pix para repasse.", 400);
    }

    if (modoFinal === ModoCobrancaEnum.AUTOMATICA && chavePix) {
      try {
        await paymentService.ensureSubaccount(chavePix);
      } catch (err: unknown) {
        logger.warn({ error: err, chavePix }, "[MotoristaFinanceiroService] Aviso ao registrar subconta na Woovi");
      }
    }

    if (input.aplicar_a_todos === true) {
      await supabaseAdmin
        .from("passageiros")
        .update({ modo_cobranca: null })
        .eq("usuario_id", usuarioId);
    }

    const { aplicar_a_todos, provedor_config, ...updatePayload } = input;

    const updated = await motoristaFinanceiroRepository.update(usuarioId, {
      ...updatePayload,
      ...(provedor_config !== undefined ? { provedor_config: provedor_config as unknown as Json } : {}),
      modo_cobranca: modoFinal,
    });

    const chavePixMudou =
      input.chave_pix_repasse !== undefined &&
      input.chave_pix_repasse !== configAtual.chave_pix_repasse;

    const encargosMudaram =
      (input.cobrar_multa_atraso !== undefined && input.cobrar_multa_atraso !== configAtual.cobrar_multa_atraso) ||
      (input.multa_atraso_valor !== undefined && Number(input.multa_atraso_valor) !== Number(configAtual.multa_atraso_valor)) ||
      (input.multa_atraso_tipo !== undefined && input.multa_atraso_tipo !== configAtual.multa_atraso_tipo) ||
      (input.cobrar_juros_atraso !== undefined && input.cobrar_juros_atraso !== configAtual.cobrar_juros_atraso) ||
      (input.juros_atraso_valor !== undefined && Number(input.juros_atraso_valor) !== Number(configAtual.juros_atraso_valor)) ||
      (input.juros_atraso_tipo !== undefined && input.juros_atraso_tipo !== configAtual.juros_atraso_tipo) ||
      (input.dias_validade_apos_vencimento !== undefined && Number(input.dias_validade_apos_vencimento) !== Number(configAtual.dias_validade_apos_vencimento));

    const deveLimparPix =
      (modoFinal !== ModoCobrancaEnum.AUTOMATICA &&
        (modoAnterior === ModoCobrancaEnum.AUTOMATICA || input.aplicar_a_todos === true)) ||
      chavePixMudou ||
      encargosMudaram;

    if (deveLimparPix) {
      await cobrancaValidacaoService.invalidarPixCobrancasPendentesPorMotorista(usuarioId, {
        apenasSemExcecaoModo: !chavePixMudou && !encargosMudaram && input.aplicar_a_todos !== true,
      });
    }

    const taxaGlobal = await motoristaFinanceiroRepository.getTaxaPadraoGlobal();

    return {
      ...updated,
      taxa_efetiva: updated.taxa_personalizada !== null && updated.taxa_personalizada !== undefined
        ? Number(updated.taxa_personalizada)
        : taxaGlobal
    };
  }
};
