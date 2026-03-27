import {
  EVENTO_MOTORISTA_TESTE_BOAS_VINDAS
} from "../config/constants.js";
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import { AtividadeAcao, AtividadeEntidadeTipo, UserType } from "../types/enums.js";
import { cleanString, onlyDigits } from "../utils/string.utils.js";
import { historicoService } from "./historico.service.js";
import { notificationService } from "./notifications/notification.service.js";
import { EVENTO_AUTH_RECUPERACAO_SENHA } from "../config/constants.js";

// ... (interfaces remain unchanged)

export interface UsuarioPayload {
  nome: string;
  apelido?: string;
  email: string;
  senha: string;
  cpfcnpj: string;
  telefone: string;
  ativo?: boolean;
}

export interface CheckUserStatusResult {
  action: 'ok' | 'bloqueado_em_uso' | 'limpar_e_prosseguir';
  message: string;
  userId?: string;
  authUid?: string;
  field?: string;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    role: string;
    [key: string]: any;
  };
}

export interface RegistroPayload {
  nome: string;
  apelido?: string;
  email: string;
  senha: string;
  cpfcnpj: string;
  telefone: string;
  ativo?: boolean;
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
  const { data: usuarios, error: findUserError } = await supabaseAdmin
    .from("usuarios")
    .select("id, ativo, cpfcnpj, email, telefone")
    .or(`cpfcnpj.eq.${cpfcnpjNormalizado},email.eq.${emailNormalizado},telefone.eq.${telefoneNormalizado}`)
    .limit(1);

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
  const { id, nome, apelido, email, cpfcnpj, telefone, ativo = false, tipo } = data;

  const { data: usuario, error } = await supabaseAdmin
    .from("usuarios")
    .insert([{
      id,
      nome: cleanString(nome, true),
      apelido: apelido ? cleanString(apelido, true) : null,
      email: cleanString(email).toLowerCase(),
      cpfcnpj: onlyDigits(cpfcnpj),
      telefone: onlyDigits(telefone),
      ativo,
      tipo: tipo || UserType.MOTORISTA
    }])
    .select("id")
    .single();

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

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
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

  const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.signInWithPassword({
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
      await supabaseAdmin.from("usuarios").delete().eq("id", usuarioId);
    }
    if (authUid) {
      await supabaseAdmin.auth.admin.deleteUser(authUid);
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

    const usuario = await criarUsuario({ ...payload, id: authUid });

    // Notificação de Boas Vindas
    if (payload.telefone) {
      notificationService.notifyDriver(payload.telefone, EVENTO_MOTORISTA_TESTE_BOAS_VINDAS, {
        nomeMotorista: payload.nome,
      })
        .catch(err => logger.error({ err }, "Falha ao enviar boas vindas"));
    }

    return { success: true, session };
  } catch (err: any) {
    if (usuarioId) await rollbackCadastro({ usuarioId, authUid });
    if (err instanceof AppError || err.field) throw err;
    throw new AppError(err.message || "Erro desconhecido ao processar registro.", 400);
  }
}

export async function login(identifier: string, password: string): Promise<AuthSession> {
  const cpf = onlyDigits(identifier);
  if (!cpf) throw new AppError("CPF inválido.", 400);

  const { data: user, error } = await supabaseAdmin
    .from("usuarios")
    .select("id, email, ativo")
    .eq("cpfcnpj", cpf)
    .single();

  if (error || !user) throw new AppError("Usuário não encontrado com este CPF.", 404);
  if (!user.ativo) throw new AppError("Sua conta está inativa. Entre em contato com o suporte.", 403);

  const { data, error: authError } = await supabaseAdmin.auth.signInWithPassword({
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

export async function loginResponsavel(cpf: string, email: string) {
  const cpfClean = onlyDigits(cpf);
  const emailClean = email.trim();

  const { data: firstMatch, error } = await supabaseAdmin
    .from("passageiros")
    .select("usuario_id")
    .eq("cpf_responsavel", cpfClean)
    .eq("email_responsavel", emailClean)
    .limit(1)
    .single();

  if (error || !firstMatch) throw new AppError("CPF ou Email não encontrados.", 401);

  const { data: passageiros, error: listError } = await supabaseAdmin
    .from("passageiros")
    .select("*, escolas(nome), veiculos(placa)")
    .eq("cpf_responsavel", cpfClean)
    .eq("email_responsavel", emailClean)
    .eq("usuario_id", firstMatch.usuario_id)
    .order("nome", { ascending: true });

  if (listError) throw new AppError("Erro ao buscar passageiros.", 500);
  return passageiros;
}

export async function updatePassword(token: string, newPassword: string, oldPassword?: string): Promise<void> {
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user || !user.email) throw new AppError("Token inválido ou expirado.", 401);

  if (oldPassword) {
    const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: user.email,
      password: oldPassword
    });
    if (signInError) throw new AppError("A senha atual está incorreta.", 401);
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    password: newPassword
  });

  if (error) {
    logger.error({ error: error.message, userId: user.id }, "Erro ao atualizar senha.");
    throw new AppError("Não foi possível atualizar a senha.", 500);
  }

  const { data: profile } = await supabaseAdmin
    .from("usuarios")
    .select("id")
    .eq("id", user.id)
    .single();

  if (profile) {
    historicoService.log({
      usuario_id: profile.id,
      entidade_tipo: AtividadeEntidadeTipo.USUARIO,
      entidade_id: profile.id,
      acao: AtividadeAcao.SENHA_ALTERADA,
      descricao: `Senha alterada pelo usuário.`
    });
  }
}

export async function resetPassword(identifier: string, redirectTo?: string): Promise<void> {
  let email = identifier.trim();
  const isCpf = /^\d+$/.test(identifier);
  if (isCpf) {
    const cpf = onlyDigits(identifier);
    const { data: user, error } = await supabaseAdmin
      .from("usuarios")
      .select("email")
      .eq("cpfcnpj", cpf)
      .single();

    if (error || !user) throw new AppError("Usuário não encontrado.", 404);
    email = user.email;
  }

  const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
    redirectTo: redirectTo
  });

  if (error) {
    logger.error({ error: error.message, email }, "Erro ao solicitar redefinição de senha.");
    throw new AppError("Não foi possível enviar o e-mail de recuperação.", 500);
  }

  const { data: user } = await supabaseAdmin
    .from("usuarios")
    .select("id")
    .eq("email", email)
    .single();

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
  const { data: user, error } = await supabaseAdmin
    .from("usuarios")
    .select("id, nome, telefone")
    .eq("cpfcnpj", cpfClean)
    .single();

  if (error || !user) throw new AppError("Usuário não encontrado com este CPF.", 404);
  if (!user.telefone) throw new AppError("O usuário não possui telefone cadastrado para recuperação.", 400);

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiraEm = new Date(Date.now() + 15 * 60000).toISOString();

  // Invalida todos os códigos anteriores pendentes do usuário
  await supabaseAdmin
    .from("recuperacoes_senha")
    .update({ usado: true })
    .eq("usuario_id", user.id)
    .eq("usado", false);

  const { error: insertError } = await supabaseAdmin
    .from("recuperacoes_senha")
    .insert([{
      usuario_id: user.id,
      codigo: otp,
      expira_em: expiraEm
    }]);

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
  const { data: user, error: userError } = await supabaseAdmin
    .from("usuarios")
    .select("id")
    .eq("cpfcnpj", cpfClean)
    .single();

  if (userError || !user) throw new AppError("Usuário não encontrado.", 404);

  const { data: rec, error: recError } = await supabaseAdmin
    .from("recuperacoes_senha")
    .select("id, expira_em, usado")
    .eq("usuario_id", user.id)
    .eq("codigo", codigo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recError || !rec) throw new AppError("Código inválido ou expirado.", 401);
  if (rec.usado) throw new AppError("Código inválido ou expirado.", 401);
  if (new Date(rec.expira_em) < new Date()) throw new AppError("Código inválido ou expirado.", 401);

  // Marcar como usado logo após validação para permitir o reset uma única vez
  await supabaseAdmin.from("recuperacoes_senha").update({ usado: true }).eq("id", rec.id);

  return { recoveryId: rec.id };
}

export async function resetarSenhaComCodigo(recoveryId: string, novaSenha: string): Promise<AuthSession> {
  const { data: rec, error } = await supabaseAdmin
    .from("recuperacoes_senha")
    .select("usuario_id, created_at, usado, usuarios(email)")
    .eq("id", recoveryId)
    .single();

  if (error || !rec) throw new AppError("Sessão de recuperação inválida.", 401);
  
  const diffMinutes = (Date.now() - new Date(rec.created_at).getTime()) / 60000;
  if (diffMinutes > 60) throw new AppError("Tempo de recuperação excedido. Solicite novamente.", 401);

  const { error: resetError } = await supabaseAdmin.auth.admin.updateUserById(rec.usuario_id, {
    password: novaSenha
  });

  if (resetError) {
    logger.error({ error: resetError.message }, "Erro ao resetar senha no Auth.");
    throw new AppError("Erro ao atualizar senha.", 500);
  }

  // Realizar login automático logo após o reset
  const email = (rec as any).usuarios.email;
  const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.signInWithPassword({
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

  return {
    access_token: sessionData.session.access_token,
    refresh_token: sessionData.session.refresh_token,
    user: sessionData.user as any
  };
}

export async function logout(token: string, usuarioId?: string): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.signOut(token);
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
  const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) throw new AppError("Sessão expirada.", 401);

  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: data.user as any
  };
}
