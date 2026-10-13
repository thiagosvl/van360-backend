import { motoristaFinanceiroRepository } from "../repositories/motorista-financeiro.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { UpdateMotoristaFinanceiroInput } from "../schemas/motorista-financeiro.schema.js";
import { AppError } from "../errors/AppError.js";
import { logger } from "../config/logger.js";
import { ModoCobrancaEnum } from "../types/enums.js";
import type { Tables } from "../types/database.types.js";

import { supabaseAdmin } from "../config/supabase.js";
import { cobrancaValidacaoService } from "./cobranca-validacao.service.js";
import { CobrancaStatus } from "../types/enums.js";

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

    let modoFinal: ModoCobrancaEnum = (configAtual.modo_cobranca as ModoCobrancaEnum) || ModoCobrancaEnum.DESATIVADO;

    if (input.modo_cobranca !== undefined) {
      modoFinal = input.modo_cobranca;
    }

    if (modoFinal === ModoCobrancaEnum.AUTOMATICA && !chavePix) {
      throw new AppError("Para ativar a cobrança automática, é obrigatório cadastrar uma chave Pix para repasse.", 400);
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

    if (input.aplicar_a_todos === true) {
      await supabaseAdmin
        .from("passageiros")
        .update({ modo_cobranca: null })
        .eq("usuario_id", usuarioId);
    }

    const { aplicar_a_todos, ...updatePayload } = input;

    const updated = await motoristaFinanceiroRepository.update(usuarioId, {
      ...updatePayload,
      modo_cobranca: modoFinal,
    });

    const deveLimparPix =
      modoFinal !== ModoCobrancaEnum.AUTOMATICA &&
      (configAtual.modo_cobranca === ModoCobrancaEnum.AUTOMATICA || input.aplicar_a_todos === true);

    if (deveLimparPix) {
      try {
        let query = supabaseAdmin
          .from("cobrancas")
          .select("id, provedor_cobranca_id, passageiro:passageiros!inner(modo_cobranca)")
          .eq("usuario_id", usuarioId)
          .eq("status", CobrancaStatus.PENDENTE)
          .not("provedor_cobranca_id", "is", null);

        if (input.aplicar_a_todos !== true) {
          query = query.is("passageiro.modo_cobranca", null);
        }

        const { data: cobrancasComPix } = await query;

        if (cobrancasComPix && cobrancasComPix.length > 0) {
          for (const cob of cobrancasComPix) {
            if (cob.provedor_cobranca_id) {
              void cobrancaValidacaoService.cancelarPixCobrancaSeExistir(cob.id, cob.provedor_cobranca_id);
              await supabaseAdmin
                .from("cobrancas")
                .update({
                  pix_copia_cola: null,
                  pix_qrcode_url: null,
                  pix_expiracao: null,
                  provedor_cobranca_id: null,
                  repasse_em_processamento: false
                })
                .eq("id", cob.id);
            }
          }
        }
      } catch (err: unknown) {
        logger.error({ error: err, usuarioId }, "[MotoristaFinanceiroService] Erro ao cancelar Pix pendentes na troca de modo da van");
      }
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
