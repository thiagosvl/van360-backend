import {
    DRIVER_EVENT_ACTIVATION,
    DRIVER_EVENT_WELCOME_TRIAL,
    PLANO_ESSENCIAL,
    PLANO_PROFISSIONAL
} from "../config/constants.js";
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import { AssinaturaCobrancaStatus, AssinaturaStatus, ConfigKey, UserType } from "../types/enums.js";
import { cleanString, onlyDigits } from "../utils/string.utils.js";
import { assinaturaCobrancaService } from "./assinatura-cobranca.service.js";
import { getConfigNumber } from "./configuracao.service.js";
import { notificationService } from "./notifications/notification.service.js";
import { pricingService } from "./pricing.service.js";

// ... (interfaces remain unchanged)

export interface UsuarioPayload {
  nome: string;
  apelido?: string;
  email: string;
  senha: string;
  cpfcnpj: string;
  telefone: string;
  ativo?: boolean;
  plano_id?: string;
  sub_plano_id?: string;
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
  plano_id?: string;
  sub_plano_id?: string;
  quantidade_personalizada?: number; // Para plano Profissional personalizado
  ativo?: boolean;
}

export interface RegistroAutomaticoResult {
  success: boolean;
  pix: {
    qrCodePayload: string;
    qrCodeUrl: string;
  };
  gateway_txid?: string; // Mantendo caso precise
  cobrancaId?: string; // Mantendo caso precise
  valor?: number;      // Mantendo caso precise
  preco_aplicado?: number;
  session: {
    access_token: string;
    refresh_token: string;
    user: any;
  };
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
    .select("id, ativo, auth_uid, cpfcnpj, email, telefone")
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
  const userId = user.id;
  const userIsActive = user.ativo;

  // Verificar campos em ordem de prioridade e retornar o primeiro encontrado
  // Ordem: CPF → E-mail → Telefone
  let campoEmUso: string | null = null;
  let field: string | undefined;

  if (user.cpfcnpj === cpfcnpjNormalizado) {
    campoEmUso = "CPF";
    field = "cpfcnpj";
  } else if (user.email?.toLowerCase().trim() === emailNormalizado) {
    campoEmUso = "E-mail";
    field = "email";
  } else if (user.telefone === telefoneNormalizado) {
    campoEmUso = "Número";
    field = "telefone";
  }

  // Se nenhum campo bateu (caso inesperado), usar mensagem genérica
  // Se nenhum campo bateu (caso inesperado), usar mensagem genérica
  const mensagem = campoEmUso ? `${campoEmUso} já está em uso.` : "E-mail/CPF/Número já está em uso.";

  logger.info({ campoEmUso, field, cpfcnpjNormalizado, emailNormalizado, telefoneNormalizado }, "DEBUG: CheckUserStatus Conflict Detection");

  const { data: assinaturaAtual, error: findAssinaturaError } = await supabaseAdmin
    .from("assinaturas_usuarios")
    .select("status, ativo")
    .eq('usuario_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (findAssinaturaError) {
    logger.error({ error: findAssinaturaError.message }, "Erro DB ao buscar status da assinatura.");
    throw new AppError("Erro ao buscar status da assinatura.", 500);
  }

  const statusAssinatura = assinaturaAtual?.[0]?.status;

  if (userIsActive) {
    return {
      action: 'bloqueado_em_uso',
      message: mensagem,
      field
    };
  }

  if (!userIsActive && statusAssinatura === AssinaturaStatus.PENDENTE_PAGAMENTO) {
    return {
      action: 'limpar_e_prosseguir',
      message: 'Lixo PIX encontrado.',
      userId: user.id,
      authUid: user.auth_uid,
    };
  }

  return {
    action: 'bloqueado_em_uso',
    message: mensagem,
    field
  };
}

export async function criarUsuario(data: UsuarioPayload & { tipo?: UserType }) {
  const { nome, apelido, email, cpfcnpj, telefone, ativo = false, tipo } = data;

  const { data: usuario, error } = await supabaseAdmin
    .from("usuarios")
    .insert([{
      nome: cleanString(nome, true),
      apelido: cleanString(apelido ?? "", true),
      email: cleanString(email).toLowerCase(),
      cpfcnpj: onlyDigits(cpfcnpj),
      telefone: onlyDigits(telefone),
      ativo,
      tipo: tipo || UserType.MOTORISTA
    }])
    .select("id, auth_uid")
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
  usuario_id: string,
  tipo: UserType = UserType.MOTORISTA
): Promise<AuthSession> {

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { usuario_id }, // Role movida para app_metadata
    app_metadata: { role: tipo } // Strict Source of Truth
  });

  if (authError || !authData?.user) {
    logger.error({ error: authError?.message }, "Falha ao criar usuário Auth.");
    throw new AppError(authError?.message || "Erro ao criar usuário de autenticação", 400);
  }

  const { error: updateError } = await supabaseAdmin
    .from("usuarios")
    .update({ auth_uid: authData.user.id })
    .eq("id", usuario_id);

  if (updateError) {
    logger.error({ error: updateError.message }, "Falha ao vincular Auth UID.");
    throw new AppError("Falha ao vincular autenticação ao usuário.", 500);
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
    user: authData.user as any, // Type assertion necessário pois o tipo do Supabase pode variar
  };
}

export async function rollbackCadastro({
  usuarioId,
  authUid,
  assinaturaId,
  cobrancaId,
}: {
  usuarioId?: string | null;
  authUid?: string | null;
  assinaturaId?: string | null;
  cobrancaId?: string | null;
}) {
  try {
    if (!cobrancaId && usuarioId) {
      await supabaseAdmin.from("assinaturas_cobrancas").delete().eq("usuario_id", usuarioId);
    } else if (cobrancaId) {
      await supabaseAdmin.from("assinaturas_cobrancas").delete().eq("id", cobrancaId);
    }

    if (!assinaturaId && usuarioId) {
      await supabaseAdmin.from("assinaturas_usuarios").delete().eq("usuario_id", usuarioId);
    } else if (assinaturaId) {
      await supabaseAdmin.from("assinaturas_usuarios").delete().eq("id", assinaturaId);
    }

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



export async function iniciaRegistroPlanoEssencial(
  payload: RegistroPayload
): Promise<RegistroManualResult> {
  let usuarioId: string | null = null;
  let authUid: string | null = null;
  let assinaturaId: string | null = null;

  try {
    payload.ativo = true;

    const cpf = onlyDigits(payload.cpfcnpj);
    const email = payload.email.toLowerCase();
    const telefone = onlyDigits(payload.telefone);

    const userStatus = await checkUserStatus(cpf, email, telefone);

    if (userStatus.action === "bloqueado_em_uso") {
      throw new AppError(userStatus.message, 409, true, userStatus.field);
    }

    if (userStatus.action === "limpar_e_prosseguir") {
      await rollbackCadastro({
        usuarioId: userStatus.userId,
        authUid: userStatus.authUid,
      });
    }

    const { data: plano, error: planoError } = await supabaseAdmin
      .from("planos")
      .select("id, nome, slug, preco, trial_days, promocao_ativa, preco_promocional")
      .eq("id", payload.plano_id)
      .single();

    if (planoError || !plano) throw new AppError("Plano selecionado não foi encontrado.", 404);

    // Validar se o plano realmente é o Essencial
    if (plano.slug !== PLANO_ESSENCIAL) {
      throw new AppError("Este plano não permite registro experimental via trial.", 403);
    }

    const usuario = await criarUsuario(payload);
    usuarioId = usuario.id;

    const session = await criarUsuarioAuth(email, payload.senha, usuario.id);
    authUid = session.user.id;

    const precoAplicado = plano.promocao_ativa ? plano.preco_promocional : plano.preco;
    const precoOrigem = plano.promocao_ativa ? "promocional" : "normal";

    const hoje = new Date();
    const anchorDate = hoje.toISOString().split("T")[0];

    // Modificado para usar configuração dinâmica ou valor do plano
    const trialDays = await getConfigNumber(ConfigKey.TRIAL_DIAS_ESSENCIAL, plano.trial_days);

    const trialEndAt = (() => {
      if (trialDays > 0) {
        const end = new Date();
        end.setDate(end.getDate() + trialDays);
        return end.toISOString();
      }
      return null;
    })();

    const { data: assinatura, error: assinaturaError } = await supabaseAdmin
      .from("assinaturas_usuarios")
      .insert({
        usuario_id: usuarioId,
        plano_id: plano.id,
        ativo: true,
        status: AssinaturaStatus.TRIAL,

        preco_aplicado: precoAplicado,
        preco_origem: precoOrigem,
        anchor_date: anchorDate,
        vigencia_fim: null,
        trial_end_at: trialEndAt,
      })
      .select()
      .single();

    if (assinaturaError) throw assinaturaError;
    assinaturaId = assinatura.id;

    const dataVencimentoCobranca = trialEndAt
      ? trialEndAt.split("T")[0] // Usar fim do trial como data de vencimento
      : anchorDate; // Sem trial, usar data de contratação

    const { data: cobranca, error: cobrancaError } = await supabaseAdmin
      .from("assinaturas_cobrancas")
      .insert({
        usuario_id: usuarioId,
        assinatura_usuario_id: assinaturaId,
        valor: precoAplicado,
        status: AssinaturaCobrancaStatus.PENDENTE_PAGAMENTO,
        data_vencimento: dataVencimentoCobranca,
        billing_type: "activation",
        descricao: `Ativação de Assinatura - Plano Essencial`,
      })
      .select()
      .single();

    if (cobrancaError) throw cobrancaError;

    // Notificação de Boas Vindas (Modular por Plano)
    if (payload.telefone) {
      logger.info(`[AuthService] Verificando notificação de boas-vindas para: ${payload.telefone}, Plano: ${plano.slug}`);
      let eventType: any = null;
      let extraData: any = {};

      if (trialDays > 0) {
        eventType = DRIVER_EVENT_WELCOME_TRIAL;
        extraData = {
          trialDays,
          dataVencimento: dataVencimentoCobranca
        };
      } else {
        // Plano Pago sem Trial (Imediato)
        eventType = DRIVER_EVENT_ACTIVATION;
      }

      if (eventType) {
        logger.info(`[AuthService] Enviando notificação tipo: ${eventType}`);
        notificationService.notifyDriver(payload.telefone, eventType, {
          nomeMotorista: payload.nome,
          nomePlano: plano.nome,
          valor: precoAplicado,
          dataVencimento: dataVencimentoCobranca,
          pixPayload: undefined,
          ...extraData
        })
          .then(() => logger.info(`[AuthService] Notificação de boas-vindas enviada com sucesso.`))
          .catch(err => logger.error({ err }, `Falha ao enviar boas vindas (${eventType})`));
      } else {
        logger.warn(`[AuthService] Nenhum evento de notificação definido para plano: ${plano.slug}`);
      }
    } else {
      logger.warn(`[AuthService] Telefone não informado, pulando notificação de boas-vindas.`);
    }

    return { success: true, session };
  } catch (err: any) {
    if (usuarioId) await rollbackCadastro({ usuarioId, authUid, assinaturaId });
    if (err instanceof AppError || err.field) throw err;

    const errorMessage = err.message.includes("já está em uso")
      ? err.message
      : err.message || "Erro desconhecido ao processar registro.";
    throw new AppError(errorMessage, 400);
  }
}

export async function iniciarRegistroplanoProfissional(
  payload: RegistroPayload
): Promise<RegistroAutomaticoResult> {
  let usuarioId: string | null = null;
  let authUid: string | null = null;
  let assinaturaId: string | null = null;
  let cobrancaId: string | null = null;

  try {
    payload.ativo = false;

    const cpf = onlyDigits(payload.cpfcnpj);
    const email = payload.email.toLowerCase();
    const telefone = onlyDigits(payload.telefone);

    const userStatus = await checkUserStatus(cpf, email, telefone);

    if (userStatus.action === "bloqueado_em_uso") {
      throw new AppError(userStatus.message, 409, true, userStatus.field);
    }

    if (userStatus.action === "limpar_e_prosseguir") {
      await rollbackCadastro({
        usuarioId: userStatus.userId,
        authUid: userStatus.authUid,
      });
    }

    const usuario = await criarUsuario(payload);
    usuarioId = usuario.id;

    const session = await criarUsuarioAuth(email, payload.senha, usuario.id);
    authUid = session.user.id;

    // Se tem quantidade_personalizada, usar cálculo personalizado
    let planoSelecionadoId: string;
    let precoAplicado: number;
    let precoOrigem: string;
    let franquiaContratada: number;
    let planoSelecionado: any = null;

    if (payload.quantidade_personalizada) {
      const { data: planoProfissionalBase, error: planoBaseError } = await supabaseAdmin
        .from("planos")
        .select("id, nome")
        .eq("slug", PLANO_PROFISSIONAL)
        .eq("tipo", "base")
        .single();

      if (planoBaseError || !planoProfissionalBase) {
        throw new AppError("Plano Profissional não encontrado.", 404);
      }

      planoSelecionadoId = planoProfissionalBase.id;
      planoSelecionado = planoProfissionalBase;
      const { precoCalculado } = await pricingService.calcularPrecoPersonalizado(payload.quantidade_personalizada);

      precoAplicado = precoCalculado;
      precoOrigem = "personalizado";
      franquiaContratada = payload.quantidade_personalizada;
    } else {
      planoSelecionadoId = payload.sub_plano_id || payload.plano_id || "";
      const { data: plano, error: planoError } = await supabaseAdmin
        .from("planos")
        .select(
          "id, nome, preco, preco_promocional, promocao_ativa, franquia_cobrancas_mes, parent:parent_id(nome)"
        )
        .eq("id", planoSelecionadoId)
        .single();

      if (planoError || !plano) throw new AppError("Erro ao encontrar o plano selecionado.", 404);

      planoSelecionado = plano;

      precoAplicado = Number(
        plano.promocao_ativa ? plano.preco_promocional ?? plano.preco : plano.preco
      );
      precoOrigem = plano.promocao_ativa ? "promocional" : "normal";
      franquiaContratada = plano.franquia_cobrancas_mes || 0;
    }

    const hoje = new Date();
    const anchorDate = hoje.toISOString().split("T")[0];

    // Calcular vigencia_fim: anchor_date + 1 mês (preservando o dia)
    const vigenciaFim = new Date(hoje);
    vigenciaFim.setMonth(vigenciaFim.getMonth() + 1);
    const vigenciaFimStr = vigenciaFim.toISOString().split("T")[0];

    const { data: assinatura, error: assinaturaError } = await supabaseAdmin
      .from("assinaturas_usuarios")
      .insert({
        usuario_id: usuarioId,
        plano_id: planoSelecionadoId,
        franquia_contratada_cobrancas: franquiaContratada,
        ativo: false,
        status: AssinaturaStatus.PENDENTE_PAGAMENTO,

        preco_aplicado: precoAplicado,
        preco_origem: precoOrigem,
        anchor_date: anchorDate,
        vigencia_fim: vigenciaFimStr
      })
      .select()
      .single();

    if (assinaturaError) throw assinaturaError;
    assinaturaId = assinatura.id;

    // Na contratação inicial, data de vencimento = data de contratação (hoje)
    const dataVencimentoCobranca = anchorDate;

    // Preparar descrição
    const descricaoCobranca = `Ativação de Assinatura - Plano ${planoSelecionado.nome}`;

    logger.info(`[AuthService] Iniciando geração de cobrança de ativação para o usuário ${usuarioId}`);
    const activationResult = await assinaturaCobrancaService.gerarCobrancaAtivacao({
      usuarioId: usuarioId!,
      assinaturaId: assinaturaId!,
      valor: precoAplicado,
      dataVencimento: dataVencimentoCobranca,
      descricao: descricaoCobranca,
      cpfResponsavel: cpf,
      nomeResponsavel: payload.nome
    });
    logger.info(`[AuthService] Cobrança de ativação gerada com sucesso. ID: ${activationResult.cobranca.id}`);

    cobrancaId = activationResult.cobranca.id;
    const pixData = activationResult.pixData; // Já vem formatado { qrCodePayload, location, gatewayTransactionId }

    // Notificação de Boas Vindas (Profissional - Ativação Imediata)
    if (payload.telefone) {
      const nomePlano = (planoSelecionado as any)?.parent?.nome || (planoSelecionado as any)?.nome;

      logger.info(`[AuthService] Enviando notificação de boas-vindas (Profissional) para: ${payload.telefone}`);
      notificationService.notifyDriver(payload.telefone, DRIVER_EVENT_ACTIVATION, {
        nomeMotorista: payload.nome,
        nomePlano: nomePlano,
        valor: precoAplicado,
        dataVencimento: dataVencimentoCobranca,
        pixPayload: pixData.qrCodePayload
      })
        .then(() => logger.info(`[AuthService] Notificação de boas-vindas (${nomePlano}) enviada com sucesso.`))
        .catch(err => logger.error({ err }, `Falha ao enviar boas vindas (${nomePlano})`));
    }

    return {
      success: true,
      session,
      cobrancaId: cobrancaId || undefined,
      preco_aplicado: precoAplicado,
      pix: {
        qrCodePayload: pixData.qrCodePayload,
        qrCodeUrl: pixData.location
      }
    };
  } catch (err: any) {
    logger.error({ err, usuarioId, authUid, assinaturaId, cobrancaId }, "Erro durante o registro de plano Profissional. Realizando rollback.");
    if (usuarioId) await rollbackCadastro({ usuarioId, authUid, assinaturaId, cobrancaId });
    if (err instanceof AppError || err.field) throw err;

    const errorMessage = err.message.includes("já está em uso")
      ? err.message
      : err.message || "Erro desconhecido ao processar registro Profissional.";
    throw new AppError(errorMessage, 400);
  }
}


export async function login(identifier: string, password: string): Promise<AuthSession> {
  // Apenas login via CPF é permitido
  const cpf = onlyDigits(identifier);

  if (!cpf) {
    throw new AppError("CPF inválido.", 400);
  }

  // 1. Busca prévia no banco: Recuperar email a partir do CPF e checar Status
  const { data: user, error } = await supabaseAdmin
    .from("usuarios")
    .select("email, ativo")
    .eq("cpfcnpj", cpf)
    .single();

  if (error || !user) {
    throw new AppError("Usuário não encontrado com este CPF.", 404);
  }

  if (!user.ativo) {
    throw new AppError("Sua conta está inativa. Entre em contato com o suporte.", 403);
  }

  // 2. Autenticação no Supabase Auth usando o email recuperado
  const { data, error: authError } = await supabaseAdmin.auth.signInWithPassword({
    email: user.email,
    password
  });

  if (authError || !data.session) {
    throw new AppError("Credenciais inválidas.", 401);
  }

  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: data.user as any
  };
}

export async function loginResponsavel(cpf: string, email: string) {
  const cpfClean = onlyDigits(cpf);
  const emailClean = email.trim();

  // 1. Encontrar um passageiro com este responsavel para identificar o motorista (usuario_id)
  const { data: firstMatch, error } = await supabaseAdmin
    .from("passageiros")
    .select("usuario_id")
    .eq("cpf_responsavel", cpfClean)
    .eq("email_responsavel", emailClean)
    .limit(1)
    .single();

  if (error || !firstMatch) {
    // Silencioso se não achar, ou erro 401
    if (error && error.code !== 'PGRST116') logger.error({ error: error.message }, "Erro DB loginResponsavel");
    throw new AppError("CPF ou Email não encontrados.", 401);
  }

  // 2. Buscar todos os passageiros deste responsavel para este motorista
  const { data: passageiros, error: listError } = await supabaseAdmin
    .from("passageiros")
    .select("*, escolas(nome), veiculos(placa)")
    .eq("cpf_responsavel", cpfClean)
    .eq("email_responsavel", emailClean)
    .eq("usuario_id", firstMatch.usuario_id)
    .order("nome", { ascending: true });

  if (listError) {
    throw new AppError("Erro ao buscar passageiros.", 500);
  }

  return passageiros;
}

export async function updatePassword(token: string, newPassword: string, oldPassword?: string): Promise<void> {
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user || !user.email) {
    throw new AppError("Token inválido ou expirado.", 401);
  }

  // Verify old password if provided (Recommended)
  if (oldPassword) {
    const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: user.email,
      password: oldPassword
    });

    if (signInError) {
      throw new AppError("A senha atual está incorreta.", 401);
    }
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    password: newPassword
  });

  if (error) {
    logger.error({ error: error.message, userId: user.id }, "Erro ao atualizar senha.");
    throw new AppError("Não foi possível atualizar a senha.", 500);
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

    if (error || !user) {
      // Throw generic error or specific? Frontend expects "Email sent" even if not found?
      // Or "CPF not found"?
      // Current frontend checks existence.
      throw new AppError("Usuário não encontrado.", 404);
    }
    email = user.email;
  }

  const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
    redirectTo: redirectTo
  });

  if (error) {
    logger.error({ error: error.message, email }, "Erro ao solicitar redefinição de senha via Supabase Admin.");
    throw new AppError("Não foi possível enviar o e-mail de recuperação.", 500);
  }
}

export async function logout(token: string): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.signOut(token);
  if (error) {
    logger.warn({ error: error.message }, "Erro ao realizar logout no Supabase.");
    // Não lançar erro crítico no logout
  }
}

export async function refreshToken(refreshToken: string): Promise<AuthSession> {
  const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token: refreshToken });

  if (error || !data.session) {
    logger.warn({ error: error?.message }, "Falha ao renovar sessão com refresh token.");
    throw new AppError("Sessão expirada.", 401);
  }

  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: data.user as any
  };
}
