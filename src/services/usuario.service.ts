import { userRepository } from "../repositories/user.repository.js";
import { AppError } from "../errors/AppError.js";
import { getNowBR, parseBrazilianDateToISO } from "../utils/date.utils.js";
import { AtividadeAcao, AtividadeEntidadeTipo, TipoChavePix } from "../types/enums.js";
import { cleanString, onlyDigits } from "../utils/string.utils.js";
import { historicoService } from "./historico.service.js";
import { isValidPixKey, isValidCPF, isValidCNPJ } from "../utils/validators.js";
import { calculateAuditDiff } from "../utils/audit-diff.util.js";
import { authProvider } from "./providers/auth.provider.js";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";
import { formatDateTime, maskCpf, maskCnpj, maskPhone } from "../utils/format.js";
import { telegramService } from "./telegram.service.js";
import { adminService } from "./admin.service.js";
import { isSubConta } from "../utils/user.utils.js";

export async function getUsuarioData(usuarioId: string) {
  const { data: usuario, error } = await userRepository.getProfileData(usuarioId);

  if (error) {
    throw error;
  }

  if (!usuario) {
    throw new AppError("Usuário não encontrado.", 404);
  }

  return usuario;
}

export async function validarAcessoUsuario(authUid: string, targetUsuarioId: string): Promise<boolean> {
  return authUid === targetUsuarioId;
}

import { AtualizarUsuarioDTO } from "../types/dtos/usuario.dto.js";

export async function atualizarUsuario(usuarioId: string, payload: AtualizarUsuarioDTO) {
  if (!usuarioId) throw new AppError("ID do usuário é obrigatório.", 400);

  const { data: usuarioAnterior } = await userRepository.getById(usuarioId);
  if (!usuarioAnterior) throw new AppError("Usuário não encontrado.", 404);

  const isSubAccount = isSubConta(usuarioAnterior);
  if (isSubAccount) {
    if (payload.logo_url !== undefined || payload.config_contrato !== undefined || payload.assinatura_digital_url !== undefined) {
      throw new AppError("Subcontas não têm permissão para alterar configurações ou marca da empresa.", 403);
    }
    if (payload.cpfcnpj !== undefined && payload.cpfcnpj !== usuarioAnterior.cpfcnpj) {
      const doc = onlyDigits(payload.cpfcnpj);
      if (doc.length > 11) {
        throw new AppError("Subcontas não têm permissão para cadastrar CNPJ.", 403);
      }
    }
    if (payload.razao_social !== undefined && payload.razao_social !== null && payload.razao_social.trim() !== "") {
      throw new AppError("Subcontas não possuem razão social.", 403);
    }
  }

  const updates: Record<string, unknown> = { updated_at: getNowBR().toISOString() };

  if (payload.nome !== undefined) {
    const nomeLimpo = cleanString(payload.nome, true);
    if (!nomeLimpo) {
      throw new AppError("Nome completo é obrigatório.", 400);
    }
    updates.nome = nomeLimpo;
  }

  if (payload.cpfcnpj !== undefined) {
    const cpfcnpjLimpo = onlyDigits(payload.cpfcnpj);
    const isCnpj = cpfcnpjLimpo.length > 11;
    const isValido = isCnpj ? isValidCNPJ(cpfcnpjLimpo) : isValidCPF(cpfcnpjLimpo);
    if (!isValido) {
      throw new AppError(`O ${isCnpj ? "CNPJ" : "CPF"} informado é inválido.`, 400);
    }

    if (cpfcnpjLimpo !== onlyDigits(usuarioAnterior.cpfcnpj || "")) {
      const { data: existingCpf } = await userRepository.getByCpfcnpjExcludingId(cpfcnpjLimpo, usuarioId);
      if (existingCpf) {
        throw new AppError(`Este ${isCnpj ? "CNPJ" : "CPF"} já está cadastrado em outra conta.`, 400);
      }
      updates.cpfcnpj = cpfcnpjLimpo;
    }
  }

  const docFinal = ((updates.cpfcnpj as string | undefined) ?? usuarioAnterior.cpfcnpj ?? "").replace(/\D/g, "");
  const isCnpjFinal = docFinal.length > 11;

  if (isCnpjFinal) {
    if (payload.razao_social !== undefined) {
      const razaoLimpa = payload.razao_social ? cleanString(payload.razao_social, true) : "";
      if (!razaoLimpa) {
        throw new AppError("Razão social é obrigatória para CNPJ.", 400);
      }
      updates.razao_social = razaoLimpa;
    } else if (!usuarioAnterior.razao_social) {
      throw new AppError("Razão social é obrigatória para CNPJ.", 400);
    }
  } else {
    if (payload.razao_social !== undefined || (updates.cpfcnpj && usuarioAnterior.razao_social)) {
      updates.razao_social = null;
    }
  }

  if (payload.email !== undefined) {
    const emailLimpo = payload.email.toLowerCase().trim();
    if (emailLimpo !== usuarioAnterior.email?.toLowerCase().trim()) {
      const { data: existingEmail } = await userRepository.getByEmailExcludingId(emailLimpo, usuarioId);
      if (existingEmail) {
        throw new AppError("Este e-mail já está cadastrado em outra conta.", 400);
      }

      const { error: authError } = await authProvider.updateUserById(usuarioId, {
        email: emailLimpo,
        email_confirm: true,
      });

      if (authError) {
        logger.error({ authError, usuarioId }, "Falha ao sincronizar e-mail no Supabase Auth.");
        throw new AppError("Não foi possível atualizar o e-mail no serviço de autenticação.", 500);
      }

      updates.email = emailLimpo;
    }
  }

  if (payload.apelido !== undefined) {
    updates.apelido = payload.apelido ? (cleanString(payload.apelido, true) || null) : null;
  }

  if (payload.telefone !== undefined) {
    const telefoneLimpo = onlyDigits(payload.telefone);
    if (!telefoneLimpo || telefoneLimpo.length < 10 || telefoneLimpo.length > 11) {
      throw new AppError("Número de telefone inválido.", 400);
    }
    updates.telefone = telefoneLimpo;
  }

  if (payload.assinatura_digital_url !== undefined) {
    updates.assinatura_digital_url = payload.assinatura_digital_url ? payload.assinatura_digital_url.trim() : null;
  }

  if (payload.logo_url !== undefined) {
    updates.logo_url = payload.logo_url ? payload.logo_url.trim() : null;
  }

  if (payload.config_contrato !== undefined) {
    updates.config_contrato = payload.config_contrato;
  }

  if (payload.data_nascimento !== undefined) {
    updates.data_nascimento = payload.data_nascimento ? parseBrazilianDateToISO(payload.data_nascimento) : null;
  }

  const { error } = await userRepository.update(usuarioId, updates);

  if (error) {
    if (updates.email && usuarioAnterior.email) {
      await authProvider.updateUserById(usuarioId, {
        email: usuarioAnterior.email.toLowerCase().trim(),
        email_confirm: true,
      }).catch((authRevertErr) => {
        logger.error({ authRevertErr, usuarioId }, "Falha ao reverter e-mail no Supabase Auth após erro no banco.");
      });
    }
    throw new AppError(`Erro ao atualizar usuário: ${error.message}`, 500);
  }

  const perfilAlterado =
    payload.nome !== undefined ||
    payload.razao_social !== undefined ||
    payload.apelido !== undefined ||
    payload.telefone !== undefined ||
    payload.data_nascimento !== undefined ||
    payload.cpfcnpj !== undefined ||
    payload.email !== undefined;

  if (perfilAlterado) {
    const perfilDiff = calculateAuditDiff(
      usuarioAnterior as Record<string, unknown> | null,
      updates,
      ["assinatura_digital_url", "config_contrato"]
    );

    if (perfilDiff.hasChanges) {
      historicoService.log({
        usuario_id: usuarioId,
        entidade_tipo: AtividadeEntidadeTipo.USUARIO,
        entidade_id: usuarioId,
        acao: AtividadeAcao.PERFIL_EDITADO,
        descricao: "Dados de identificação do perfil atualizados.",
        meta: {
          campos_alterados: perfilDiff.campos,
          campos: perfilDiff.campos,
          alteracoes: perfilDiff.alteracoes,
        },
      });
    }
  } else if (payload.config_contrato !== undefined) {
    const configAntiga = (usuarioAnterior?.config_contrato as Record<string, unknown>) || {};
    const configNova = payload.config_contrato || {};
    const configDiff = calculateAuditDiff(configAntiga, configNova);

    if (configDiff.hasChanges) {
      const config = payload.config_contrato as Record<string, unknown> | null;
      historicoService.log({
        usuario_id: usuarioId,
        entidade_tipo: AtividadeEntidadeTipo.USUARIO,
        entidade_id: usuarioId,
        acao: AtividadeAcao.CONTRATO_CONFIG_EDITADA,
        descricao: `Configurações de contrato atualizadas (Usa contratos: ${config?.usar_contratos ? "Sim" : "Não"}).`,
        meta: {
          usar_contratos: config?.usar_contratos,
          multa_atraso: config?.multa_atraso,
          juros_atraso: config?.juros_atraso,
          multa_rescisao: config?.multa_rescisao,
          campos_alterados: configDiff.campos,
          campos: configDiff.campos,
          alteracoes: configDiff.alteracoes,
        },
      });
    }
  }

  if (payload.logo_url !== undefined) {
    const logoAnterior = usuarioAnterior?.logo_url || null;
    const logoNovo = updates.logo_url ? (updates.logo_url as string) : null;

    if (logoAnterior !== logoNovo) {
      if (logoNovo) {
        historicoService.log({
          usuario_id: usuarioId,
          entidade_tipo: AtividadeEntidadeTipo.USUARIO,
          entidade_id: usuarioId,
          acao: AtividadeAcao.LOGO_ATUALIZADO,
          descricao: logoAnterior
            ? "Logotipo do motorista atualizado."
            : "Logotipo do motorista cadastrado.",
          meta: {
            logo_anterior: logoAnterior,
            logo_novo: logoNovo,
          },
        });
      } else {
        historicoService.log({
          usuario_id: usuarioId,
          entidade_tipo: AtividadeEntidadeTipo.USUARIO,
          entidade_id: usuarioId,
          acao: AtividadeAcao.LOGO_REMOVIDO,
          descricao: "Logotipo do motorista removido.",
          meta: {
            logo_anterior: logoAnterior,
          },
        });
      }
    }
  }

  return { success: true };
}

export async function alterarTelefoneUsuario(usuarioId: string, telefone: string) {
  if (!usuarioId) throw new AppError("ID do usuário é obrigatório.", 400);
  if (!telefone) throw new AppError("Novo número de telefone é obrigatório.", 400);

  const telefoneLimpo = onlyDigits(telefone);
  if (!telefoneLimpo || telefoneLimpo.length < 10 || telefoneLimpo.length > 11) {
    throw new AppError("Número de telefone inválido. Informe DDD e número com 10 ou 11 dígitos.", 400);
  }

  const { data: usuarioAtual } = await userRepository.getById(usuarioId);
  const telefoneAntigo = usuarioAtual?.telefone;

  const { error } = await userRepository.update(usuarioId, {
    telefone: telefoneLimpo,
    updated_at: getNowBR().toISOString()
  });

  if (error) {
    throw new AppError(`Erro ao alterar telefone do usuário: ${error.message}`, 500);
  }

  historicoService.log({
    usuario_id: usuarioId,
    entidade_tipo: AtividadeEntidadeTipo.USUARIO,
    entidade_id: usuarioId,
    acao: AtividadeAcao.PERFIL_EDITADO,
    descricao: "Telefone de contato do usuário alterado.",
    meta: {
      telefone: telefoneLimpo,
      alteracoes: [{
        campo: "telefone",
        de: telefoneAntigo || null,
        para: telefoneLimpo
      }],
      campos: ["telefone"]
    }
  });

  return { success: true, telefone: telefoneLimpo };
}

export async function atualizarPixUsuario(usuarioId: string, payload: {
  chave_pix: string | null;
  tipo_chave_pix: TipoChavePix | null;
}) {
  if (!usuarioId) throw new AppError("ID do usuário é obrigatório.", 400);

  const { chave_pix, tipo_chave_pix } = payload;

  if ((chave_pix && !tipo_chave_pix) || (!chave_pix && tipo_chave_pix)) {
    throw new AppError("A chave Pix e o tipo de chave Pix devem ser fornecidos juntos ou ambos nulos.", 400);
  }

  const { data: currentPixData } = await userRepository.getPixKey(usuarioId);

  const updates: any = {
    updated_at: getNowBR().toISOString()
  };

  if (chave_pix && tipo_chave_pix) {
    const isValid = isValidPixKey(tipo_chave_pix, chave_pix);
    if (!isValid) {
      throw new AppError("Formato de chave Pix inválido para o tipo selecionado.", 400);
    }
    updates.chave_pix = chave_pix;
    updates.tipo_chave_pix = tipo_chave_pix;
  } else {
    updates.chave_pix = null;
    updates.tipo_chave_pix = null;
  }

  const { error } = await userRepository.update(usuarioId, updates);

  if (error) {
    throw new AppError(`Erro ao atualizar dados Pix do usuário: ${error.message}`, 500);
  }

  const isNewPix = !currentPixData?.chave_pix;
  const descricaoPix = updates.chave_pix 
    ? (isNewPix ? "Chave Pix de recebimento estática configurada pelo motorista." : "Chave Pix de recebimento estática atualizada pelo motorista.")
    : "Chave Pix de recebimento estática removida pelo motorista.";

  const pixDiff = calculateAuditDiff(
    { tipo_chave_pix: currentPixData?.tipo_chave_pix, chave_pix: currentPixData?.chave_pix },
    { tipo_chave_pix, chave_pix: updates.chave_pix }
  );

  if (pixDiff.hasChanges) {
    historicoService.log({
      usuario_id: usuarioId,
      entidade_tipo: AtividadeEntidadeTipo.USUARIO,
      entidade_id: usuarioId,
      acao: AtividadeAcao.CHAVE_PIX_ALTERADA,
      descricao: descricaoPix,
      meta: { 
        tipo_chave_pix,
        chave_pix: updates.chave_pix ? "***" : null,
        campos_alterados: pixDiff.campos,
        campos: pixDiff.campos,
        alteracoes: pixDiff.alteracoes
      }
    });
  }

  return { success: true };
}

export async function atualizarCanalAquisicao(usuarioId: string, canalAquisicao: string) {
  if (!usuarioId) throw new AppError("ID do usuário é obrigatório.", 400);

  const { data: usuarioAtual } = await userRepository.getById(usuarioId);
  const canalAntigo = (usuarioAtual as Record<string, unknown> | null)?.canal_aquisicao;

  const updates: Record<string, unknown> = {
    canal_aquisicao: canalAquisicao,
    updated_at: getNowBR().toISOString()
  };

  const { error } = await userRepository.update(usuarioId, updates);

  if (error) {
    throw new AppError(`Erro ao atualizar canal de aquisição: ${error.message}`, 500);
  }

  historicoService.log({
    usuario_id: usuarioId,
    entidade_tipo: AtividadeEntidadeTipo.USUARIO,
    entidade_id: usuarioId,
    acao: AtividadeAcao.PERFIL_EDITADO,
    descricao: "Canal de aquisição informado pelo usuário.",
    meta: {
      canal_aquisicao: canalAquisicao,
      alteracoes: [{
        campo: "canal_aquisicao",
        de: canalAntigo || null,
        para: canalAquisicao
      }],
      campos: ["canal_aquisicao"]
    }
  });

  return { success: true };
}

export async function listarMotoristasParaLembreteAniversario() {
  const { data, error } = await userRepository.listMotoristasAtivosParaAniversario();
  if (error) {
    throw new AppError("Erro ao buscar motoristas ativos para aniversário", 500);
  }
  return data || [];
}

export async function excluirMinhaConta(userId: string) {
  if (!userId) {
    throw new AppError("ID do usuário é obrigatório.", 400);
  }

  const { data: usuario, error: fetchError } = await userRepository.getById(userId);
  if (fetchError || !usuario) {
    throw new AppError("Usuário não encontrado.", 404);
  }

  if (isSubConta(usuario)) {
    throw new AppError("Subcontas não podem solicitar a exclusão da conta. O encerramento do vínculo deve ser realizado pelo motorista titular.", 403);
  }

  const cpfcnpjClean = usuario.cpfcnpj?.replace(/\D/g, "") || "";
  const docFormatado = cpfcnpjClean ? (cpfcnpjClean.length > 11 ? maskCnpj(cpfcnpjClean) : maskCpf(cpfcnpjClean)) : "";
  const nomeExibicao = `${usuario.nome || "Não informado"}${usuario.apelido ? ` (${usuario.apelido})` : ""}`;
  const telLine = usuario.telefone ? `<b>Telefone:</b> ${maskPhone(usuario.telefone)}\n` : "";
  const docLine = docFormatado ? `<b>CPF/CNPJ:</b> ${docFormatado}\n` : "";
  const dataHoraBR = formatDateTime(getNowBR());

  let telegramMessage = `🚨 <b>Exclusão de Conta Solicitada pelo Usuário!</b>\n\n` +
    `<b>Nome:</b> ${nomeExibicao}\n` +
    `<b>Email:</b> ${usuario.email || "Não informado"}\n` +
    telLine +
    docLine +
    `<b>Data:</b> ${dataHoraBR}\n` +
    `<b>ID:</b> ${userId}`;

  if (env.NODE_ENV !== "production") {
    telegramMessage = `[DEV]\n${telegramMessage}`;
  }

  await telegramService.sendMessage(telegramMessage).catch((err: unknown) => {
    logger.warn({ err, userId }, "Falha ao enviar alerta de exclusão no Telegram");
  });

  await adminService.deleteUser(userId);

  return { success: true };
}
