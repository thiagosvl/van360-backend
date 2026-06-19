import {
  EVENTO_MOTORISTA_TESTE_BOAS_VINDAS,
  EVENTO_ADMIN_NOVO_CADASTRO
} from "../config/constants.js";
import { logger } from "../config/logger.js";
import { userRepository } from "../repositories/user.repository.js";
import { authRepository } from "../repositories/auth.repository.js";
import { authProvider } from "./providers/auth.provider.js";
import { AppError } from "../errors/AppError.js";
import { AtividadeAcao, AtividadeEntidadeTipo, UserType } from "../types/enums.js";
import { cleanString, onlyDigits } from "../utils/string.utils.js";
import { historicoService } from "./historico.service.js";
import { getNowBR, addMinutes, isBeforeNowBR, parseLocalDate, parseBrazilianDateToISO } from "../utils/date.utils.js";
import { notificationService } from "./notifications/notification.service.js";
import { EVENTO_AUTH_RECUPERACAO_SENHA, EVENTO_AUTH_SENHA_ALTERADA } from "../config/constants.js";

// ... (interfaces remain unchanged)

const TERMOS_VERSAO_ATUAL = "2026-04";

export interface UsuarioPayload {
  nome: string;
  apelido?: string;
  email: string;
  senha: string;
  cpfcnpj: string;
  telefone: string;
  ativo?: boolean;
  termos_aceitos?: boolean;
  data_nascimento?: string;
}

export interface CheckUserStatusResult {
  action: 'ok' | 'bloqueado_em_uso' | 'limpar_e_prosseguir';
  message: string;
  userId?: string;
  authUid?: string;
  field?: string;
}

export interface RecoverySessionQueryResult {
  usuario_id: string;
  created_at: string;
  usado: boolean;
  usuarios: {
    email: string;
    nome: string;
    telefone: string | null;
  } | null;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  user: any;
}

export interface RegistroPayload {
  nome: string;
  apelido?: string;
  email: string;
  senha: string;
  cpfcnpj: string;
  telefone: string;
  ativo?: boolean;
  termos_aceitos: boolean;
  indicador_id?: string;
  data_nascimento?: string;
}

export interface RegistroManualResult {
  success: boolean;
  session: {
    access_token: string;
    refresh_token: string;
    user: any;
  };
}

export async function checkUserStatus(
  cpfcnpj: string,
  email: string,
  telefone: string
): Promise<CheckUserStatusResult> {

  // Normalizar valores para comparação
  const cpfcnpjNormalizado = onlyDigits(cpfcnpj);
  const emailNormalizado = email.toLowerCase().trim();
  const telefoneNormalizado = onlyDigits(telefone);

  // Uma única query para buscar usuário que corresponda a qualquer um dos campos
  const { data: usuarios, error: findUserError } = await authRepository.checkUserStatus(cpfcnpjNormalizado, emailNormalizado, telefoneNormalizado);

  if (findUserError) {
    logger.error({ error: findUserError.message }, "Erro DB ao verificar status.");
    throw new AppError("Erro interno ao validar registro.", 500);
  }

  if (!usuarios || usuarios.length === 0) {
    return { action: 'ok', message: 'Usuário novo.' };
  }

  const user = usuarios[0];
  const field: string | undefined = user.cpfcnpj === cpfcnpjNormalizado ? "cpfcnpj" :
    user.email?.toLowerCase().trim() === emailNormalizado ? "email" :
      user.telefone === telefoneNormalizado ? "telefone" : undefined;

  const campoEmUso = field === "cpfcnpj" ? "CPF" : field === "email" ? "E-mail" : "Número";
  const mensagem = campoEmUso ? `${campoEmUso} já está em uso.` : "E-mail/CPF/Número já está em uso.";

  return {
    action: 'bloqueado_em_uso',
    message: mensagem,
    field
  };
}

export async function criarUsuario(data: UsuarioPayload & { tipo?: UserType, id: string }) {
  const { id, nome, apelido, email, cpfcnpj, telefone, ativo = false, tipo, termos_aceitos, data_nascimento } = data;

  const { data: usuario, error } = await userRepository.insert({
      id,
      nome: cleanString(nome, true),
      apelido: apelido ? cleanString(apelido, true) : null,
      email: cleanString(email).toLowerCase(),
      cpfcnpj: onlyDigits(cpfcnpj),
      telefone: onlyDigits(telefone),
      ativo,
      tipo: tipo || UserType.MOTORISTA,
      termos_aceitos_em: termos_aceitos ? getNowBR().toISOString() : null,
      termos_versao: termos_aceitos ? TERMOS_VERSAO_ATUAL : null,
      created_at: getNowBR().toISOString(),
      data_nascimento: parseBrazilianDateToISO(data_nascimento),
    });

  if (error) {
    logger.error({ error: error.message }, "Falha ao criar usuário no DB.");
    throw new AppError("Falha ao criar usuário.", 500);
  }
  return usuario;
}

export async function criarUsuarioAuth(
  email: string,
  senha: string,
  tipo: UserType = UserType.MOTORISTA
): Promise<AuthSession> {

  const { data: authData, error: authError } = await authProvider.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: {},
    app_metadata: { role: tipo }
  });

  if (authError || !authData?.user) {
    logger.error({ error: authError?.message }, "Falha ao criar usuário Auth.");
    throw new AppError(authError?.message || "Erro ao criar usuário de autenticação", 400);
  }

  const { data: sessionData, error: sessionError } = await authProvider.signInWithPassword({
    email,
    password: senha,
  });

  if (sessionError || !sessionData?.session) {
    logger.error({ error: sessionError?.message }, "Falha ao gerar sessão de autenticação.");
    throw new AppError("Falha ao gerar sessão de autenticação.", 500);
  }

  return {
    access_token: sessionData.session.access_token,
    refresh_token: sessionData.session.refresh_token,
    user: authData.user as any,
  };
}

export async function rollbackCadastro({
  usuarioId,
  authUid,
}: {
  usuarioId?: string | null;
  authUid?: string | null;
}) {
  try {
    if (usuarioId) {
      await userRepository.delete(usuarioId);
    }
    if (authUid) {
      await authProvider.deleteUser(authUid);
    }
  } catch (err: any) {
    logger.warn({ error: err.message }, "Erro durante rollback (pode ser parcial).");
  }
}

export async function registrarUsuario(
  payload: RegistroPayload
): Promise<RegistroManualResult> {
  let usuarioId: string | null = null;
  let authUid: string | null = null;

  try {
    payload.ativo = true;

    const cpf = onlyDigits(payload.cpfcnpj);
    const email = payload.email.toLowerCase();
    const telefone = onlyDigits(payload.telefone);

    const userStatus = await checkUserStatus(cpf, email, telefone);

    if (userStatus.action === "bloqueado_em_uso") {
      throw new AppError(userStatus.message, 409, true, userStatus.field);
    }

    const session = await criarUsuarioAuth(email, payload.senha);
    authUid = session.user.id;
    usuarioId = authUid;

    if (!usuarioId || !authUid) throw new AppError("Falha ao gerar identificador único.", 500);

    const usuario = await criarUsuario({ ...payload, id: authUid });

    // --- SETUP SAAS SUBSCRIPTION ---
    const { subscriptionService } = await import("./subscriptions/subscription.service.js");
    const { subscriptionReferralService } = await import("./subscriptions/subscription-referral.service.js");
    
    // 1. Iniciar Trial de 15 dias
    const subscription = await subscriptionService.getOrCreateSubscription(usuarioId);

    // 2. Vincular Indicador (se houver indicador_id no payload)
    if (subscription && payload.indicador_id) {
      try {
        await subscriptionReferralService.registerReferral(payload.indicador_id, usuarioId);
      } catch (e) {
        logger.error({ error: e }, "Falha ao registrar referral");
      }
    }

    // Notificação de Boas Vindas
    if (payload.telefone) {
      notificationService.notifyDriver(payload.telefone, EVENTO_MOTORISTA_TESTE_BOAS_VINDAS, {
        nomeMotorista: payload.nome,
        dataVencimento: subscription?.trial_ends_at ?? undefined,
      })
        .catch(err => logger.error({ err: err instanceof Error ? err.message : String(err) }, "Falha ao enviar boas vindas"));
    }

    // Notificação para o Admin (Telegram)
    notificationService.notifyAdmin(EVENTO_ADMIN_NOVO_CADASTRO, {
      nome: payload.nome,
      email: payload.email,
      telefone: payload.telefone,
      cpfcnpj: payload.cpfcnpj,
      dataRegistro: getNowBR().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
      usuarioId: usuarioId as string
    }).catch(err => logger.error({ err: err instanceof Error ? err.message : String(err) }, "Falha ao notificar admin sobre cadastro"));

    return { success: true, session };
  } catch (err: unknown) {
    if (usuarioId) await rollbackCadastro({ usuarioId, authUid });
    if (err instanceof AppError || (err && typeof err === 'object' && 'field' in err)) throw err as AppError;
    const errorMessage = err instanceof Error ? err.message : String(err);
    throw new AppError(errorMessage || "Erro desconhecido ao processar registro.", 400);
  }
}

export async function login(identifier: string, password: string): Promise<AuthSession> {
  const cpf = onlyDigits(identifier);
  if (!cpf) throw new AppError("CPF inválido.", 400);

  const { data: user, error } = await authRepository.getUserLogin(cpf);

  if (error || !user) throw new AppError("Usuário não encontrado com este CPF.", 404);
  if (!user.ativo) throw new AppError("Sua conta está inativa. Entre em contato com o suporte.", 403);

  const { data, error: authError } = await authProvider.signInWithPassword({
    email: user.email,
    password
  });

  if (authError || !data.session) throw new AppError("Credenciais inválidas.", 401);

  historicoService.log({
    usuario_id: user.id,
    entidade_tipo: AtividadeEntidadeTipo.USUARIO,
    entidade_id: user.id,
    acao: AtividadeAcao.LOGIN,
    descricao: `Usuário realizou login com sucesso.`
  });

  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: data.user as any
  };
}



export async function updatePassword(token: string, newPassword: string, oldPassword?: string): Promise<void> {
  const { data: { user }, error: userError } = await authProvider.getUser(token);
  if (userError || !user || !user.email) throw new AppError("Token inválido ou expirado.", 401);

  if (oldPassword) {
    const { error: signInError } = await authProvider.signInWithPassword({
      email: user.email,
      password: oldPassword
    });
    if (signInError) throw new AppError("A senha atual está incorreta.", 401);
  }

  const { error } = await authProvider.updateUserById(user.id, {
    password: newPassword
  });

  if (error) {
    logger.error({ error: error.message, userId: user.id }, "Erro ao atualizar senha.");
    throw new AppError("Não foi possível atualizar a senha.", 500);
  }

  const { data: profile } = await userRepository.getById(user.id);

  if (profile) {
    historicoService.log({
      usuario_id: profile.id,
      entidade_tipo: AtividadeEntidadeTipo.USUARIO,
      entidade_id: profile.id,
      acao: AtividadeAcao.SENHA_ALTERADA,
      descricao: `Senha alterada pelo usuário.`
    });

    if (profile.telefone) {
      notificationService.notifyDriver(profile.telefone, EVENTO_AUTH_SENHA_ALTERADA, {
        nomeMotorista: profile.nome
      }).catch(err => logger.error({ err: err instanceof Error ? err.message : String(err) }, "Falha ao enviar notificação de senha alterada"));
    }
  }
}

export async function resetPassword(identifier: string, redirectTo?: string): Promise<void> {
  let email = identifier.trim();
  const isCpf = /^\d+$/.test(identifier);
  if (isCpf) {
    const cpf = onlyDigits(identifier);
    const { data: user, error } = await authRepository.getUserIdAndEmailByCpf(cpf);

    if (error || !user) throw new AppError("Usuário não encontrado.", 404);
    email = user.email;
  }

  const { error } = await authProvider.resetPasswordForEmail(email, {
    redirectTo: redirectTo
  });

  if (error) {
    logger.error({ error: error.message, email }, "Erro ao solicitar redefinição de senha.");
    throw new AppError("Não foi possível enviar o e-mail de recuperação.", 500);
  }

  const { data: user } = await authRepository.getUserByEmail(email);

  if (user) {
    historicoService.log({
      usuario_id: user.id,
      entidade_tipo: AtividadeEntidadeTipo.USUARIO,
      entidade_id: user.id,
      acao: AtividadeAcao.RECUPERACAO_SENHA,
      descricao: `Solicitação de redefinição de senha enviada para o e-mail.`
    });
  }
}

export async function solicitarRecuperacaoWhatsapp(cpf: string): Promise<{ telefoneMascarado: string }> {
  const cpfClean = onlyDigits(cpf);
  const { data: user, error } = await authRepository.getUserIdAndEmailByCpf(cpfClean);

  if (error || !user) throw new AppError("Usuário não encontrado com este CPF.", 404);
  if (!user.telefone) throw new AppError("O usuário não possui telefone cadastrado para recuperação.", 400);

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiraEm = addMinutes(getNowBR(), 15).toISOString();

  // Invalida todos os códigos anteriores pendentes do usuário
  await authRepository.invalidateRecoveryCodes(user.id);

  const { error: insertError } = await authRepository.insertRecoveryCode(user.id, otp, expiraEm);

  if (insertError) {
    logger.error({ error: insertError.message }, "Erro ao salvar OTP no banco.");
    throw new AppError("Erro ao processar solicitação de recuperação.", 500);
  }

  await notificationService.notifyDriver(user.telefone, EVENTO_AUTH_RECUPERACAO_SENHA, {
    nomeMotorista: user.nome,
    otpCode: otp
  }).catch(err => logger.error({ err }, "Falha ao enviar OTP via WhatsApp"));
  
  historicoService.log({
    usuario_id: user.id,
    entidade_tipo: AtividadeEntidadeTipo.USUARIO,
    entidade_id: user.id,
    acao: AtividadeAcao.RECUPERACAO_SENHA,
    descricao: `Solicitação de recuperação de senha via WhatsApp enviada.`
  });

  const finalTelefone = user.telefone.slice(-4);
  return { telefoneMascarado: `(XX) XXXXX-${finalTelefone}` };
}

export async function validarCodigoWhatsApp(cpf: string, codigo: string): Promise<{ recoveryId: string }> {
  const cpfClean = onlyDigits(cpf);
  const { data: user, error: userError } = await authRepository.getUserIdAndEmailByCpf(cpfClean);

  if (userError || !user) throw new AppError("Usuário não encontrado.", 404);

  const { data: rec, error: recError } = await authRepository.getRecoveryCode(user.id, codigo);

  if (recError || !rec) throw new AppError("Código inválido ou expirado.", 401);
  if (rec.usado) throw new AppError("Código inválido ou expirado.", 401);
  if (isBeforeNowBR(rec.expira_em)) throw new AppError("Código inválido ou expirado.", 401);

  // Marcar como usado logo após validação para permitir o reset uma única vez
  await authRepository.markRecoveryCodeUsed(rec.id);

  return { recoveryId: rec.id };
}

export async function resetarSenhaComCodigo(recoveryId: string, novaSenha: string): Promise<AuthSession> {
  const { data: recData, error } = await authRepository.getRecoverySession(recoveryId);

  if (error || !recData) throw new AppError("Sessão de recuperação inválida.", 401);
  const rec = recData as unknown as RecoverySessionQueryResult;
  
  const diffMinutes = (getNowBR().getTime() - parseLocalDate(rec.created_at).getTime()) / 60000;
  if (isNaN(diffMinutes) || diffMinutes > 60) throw new AppError("Tempo de recuperação excedido. Solicite novamente.", 401);

  const { error: resetError } = await authProvider.updateUserById(rec.usuario_id, {
    password: novaSenha
  });

  if (resetError) {
    logger.error({ error: resetError.message }, "Erro ao resetar senha no Auth.");
    throw new AppError("Erro ao atualizar senha.", 500);
  }

  // Realizar login automático logo após o reset
  if (!rec.usuarios) throw new AppError("Perfil de usuário não encontrado para auto-login.", 500);
  
  const email = rec.usuarios.email;
  const { data: sessionData, error: sessionError } = await authProvider.signInWithPassword({
    email,
    password: novaSenha,
  });

  if (sessionError || !sessionData?.session) {
    logger.error({ error: sessionError?.message }, "Falha ao gerar sessão após reset.");
    throw new AppError("Senha alterada, mas falha ao iniciar sessão automática.", 500);
  }

  historicoService.log({
    usuario_id: rec.usuario_id,
    entidade_tipo: AtividadeEntidadeTipo.USUARIO,
    entidade_id: rec.usuario_id,
    acao: AtividadeAcao.SENHA_ALTERADA,
    descricao: `Senha redefinida com sucesso via WhatsApp com login automático.`
  });

  const userProfile = rec.usuarios;
  if (userProfile?.telefone) {
    notificationService.notifyDriver(userProfile.telefone, EVENTO_AUTH_SENHA_ALTERADA, {
      nomeMotorista: userProfile.nome
    }).catch(err => logger.error({ err: err instanceof Error ? err.message : String(err) }, "Falha ao enviar notificação de senha alterada (reset)"));
  }

  return {
    access_token: sessionData.session.access_token,
    refresh_token: sessionData.session.refresh_token,
    user: sessionData.user as any
  };
}

export async function logout(token: string, usuarioId?: string): Promise<void> {
  const { error } = await authProvider.signOut(token);
  if (error) logger.warn({ error: error.message }, "Erro ao realizar logout no Supabase.");

  if (usuarioId) {
    historicoService.log({
      usuario_id: usuarioId,
      entidade_tipo: AtividadeEntidadeTipo.USUARIO,
      entidade_id: usuarioId,
      acao: AtividadeAcao.LOGOUT,
      descricao: `Usuário realizou logout do sistema.`
    });
  }
}

export async function refreshToken(refreshToken: string): Promise<AuthSession> {
  const { data, error } = await authProvider.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) throw new AppError("Sessão expirada.", 401);

  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: data.user as any
  };
}
