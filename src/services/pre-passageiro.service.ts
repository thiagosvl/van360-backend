import { moneyToNumber } from "../utils/currency.utils.js";
import { cleanString, onlyDigits } from "../utils/string.utils.js";
import { toPersistenceString } from "../utils/date.utils.js";
import { CreatePrePassageiroDTO } from "../types/dtos/pre-passageiro.dto.js";
import { prePassageiroRepository } from "../repositories/pre-passageiro.repository.js";

import { userRepository } from "../repositories/user.repository.js";

export const prePassageiroService = {
  async listPrePassageiros(usuarioId: string, search?: string) {
    return prePassageiroRepository.listPrePassageiros(usuarioId, search);
  },

  async createPrePassageiro(payload: CreatePrePassageiroDTO) {
    let valorCobranca = null;
    if (payload.valor_cobranca !== undefined && payload.valor_cobranca !== null && payload.valor_cobranca !== "") {
      valorCobranca = typeof payload.valor_cobranca === "string"
        ? moneyToNumber(payload.valor_cobranca)
        : Number(payload.valor_cobranca);

      if (isNaN(valorCobranca) || valorCobranca <= 0) {
        valorCobranca = null;
      }
    }

    let diaVencimento = null;
    if (payload.dia_vencimento !== undefined && payload.dia_vencimento !== null && payload.dia_vencimento !== "") {
      diaVencimento = Number(payload.dia_vencimento);
      if (isNaN(diaVencimento) || diaVencimento < 1 || diaVencimento > 31) {
        diaVencimento = null;
      }
    }

    const { data: targetUser } = await userRepository.getById(payload.usuario_id);
    const targetOwnerId = targetUser?.conta_pai_id || payload.usuario_id;

    const prePassageiroData = {
      usuario_id: targetOwnerId,
      nome: cleanString(payload.nome, true),
      nome_responsavel: cleanString(payload.nome_responsavel, true),

      cpf_responsavel: payload.cpf_responsavel ? onlyDigits(payload.cpf_responsavel) : null,
      telefone_responsavel: payload.telefone_responsavel ? onlyDigits(payload.telefone_responsavel) : null,
      email_responsavel: payload.email_responsavel ? payload.email_responsavel.trim().toLowerCase() : null,
      escola_id: payload.escola_id || null,
      periodo: payload.periodo || null,
      valor_cobranca: valorCobranca,
      dia_vencimento: diaVencimento,
      logradouro: payload.logradouro || null,
      numero: payload.numero || null,
      bairro: payload.bairro || null,
      cidade: payload.cidade || null,
      estado: payload.estado || null,
      cep: payload.cep || null,
      referencia: payload.referencia || null,
      complemento: payload.complemento || null,
      observacoes: payload.observacoes || null,
      modalidade: payload.modalidade || null,
      turma: payload.turma || null,
      nome_professor: payload.nome_professor || null,
      genero: payload.genero || null,
      parentesco_responsavel: payload.parentesco_responsavel || null,
      data_inicio_transporte: payload.data_inicio_transporte ? toPersistenceString(payload.data_inicio_transporte) : null,
      data_nascimento: payload.data_nascimento ? toPersistenceString(payload.data_nascimento) : null
    };

    const inserted = await prePassageiroRepository.insert(prePassageiroData);

    // --- NOTIFICAÇÃO PUSH (FIREBASE SOMENTE) AO MOTORISTA ---
    const { notificationService } = await import("./notifications/notification.service.js");
    const { EVENTO_MOTORISTA_NOVO_PRE_CADASTRO } = await import("../config/constants.js");
    const { NotificationChannelEnum } = await import("../types/enums.js");
    const { logger } = await import("../config/logger.js");

    notificationService.notifyDriver(
      targetOwnerId,
      EVENTO_MOTORISTA_NOVO_PRE_CADASTRO,
      {
        nomeResponsavel: inserted.nome_responsavel,
        nomePassageiro: inserted.nome,
        passageiroId: inserted.id,
      },
      {
        channels: [NotificationChannelEnum.FIREBASE],
        usuarioId: targetOwnerId,
      }
    ).catch((err: unknown) => {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error({ error: errorMessage, targetOwnerId, prePassageiroId: inserted.id }, "[prePassageiroService] Falha ao disparar Push de novo pré-cadastro ao motorista");
    });

    // --- LOG DE AUDITORIA ---
    const { historicoService } = await import("./historico.service.js");
    const { AtividadeAcao, AtividadeEntidadeTipo } = await import("../types/enums.js");

    historicoService.log({
      usuario_id: payload.usuario_id,
      entidade_tipo: AtividadeEntidadeTipo.PASSAGEIRO,
      entidade_id: inserted.id,
      acao: AtividadeAcao.PRE_CADASTRO_CRIADO,
      descricao: `Cadastro de solicitação de aluno preenchido para ${inserted.nome}.`,
      meta: { nome: inserted.nome, responsavel: inserted.nome_responsavel }
    });

    return inserted;
  },

  async deletePrePassageiro(prePassageiroId: string) {
    try {
      await prePassageiroRepository.delete(prePassageiroId);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Falha ao excluir o pré-cadastro: ${msg}`);
    }
  },
};
