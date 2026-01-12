import { ASSINATURA_COBRANCA_STATUS_PENDENTE_PAGAMENTO, ASSINATURA_USUARIO_STATUS_ATIVA, ASSINATURA_USUARIO_STATUS_PENDENTE_PAGAMENTO, ASSINATURA_USUARIO_STATUS_TRIAL, CONFIG_KEY_TRIAL_DIAS_ESSENCIAL, DRIVER_EVENT_ACTIVATION, DRIVER_EVENT_WELCOME_FREE, DRIVER_EVENT_WELCOME_TRIAL, PLANO_GRATUITO, PLANO_PROFISSIONAL } from "../config/constants.js";
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import { BillingMode, UserType } from "../types/enums.js";
import { cleanString, onlyDigits } from "../utils/string.utils.js";
import { cobrancaService } from "./cobranca.service.js";
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
      qrCode: string;
      qrCodeUrl: string;
  };
  inter_txid?: string; // Mantendo caso precise
  cobrancaId?: string; // Mantendo caso precise
  valor?: number;      // Mantendo caso precise
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

  if (user.cpfcnpj === cpfcnpjNormalizado) {
    campoEmUso = "CPF";
  } else if (user.email?.toLowerCase().trim() === emailNormalizado) {
    campoEmUso = "E-mail";
  } else if (user.telefone === telefoneNormalizado) {
    campoEmUso = "Telefone";
  }

  // Se nenhum campo bateu (caso inesperado), usar mensagem genérica
  const mensagem = campoEmUso ? `${campoEmUso} já está em uso.` : "E-mail/CPF/Telefone já está em uso.";

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
      message: mensagem
    };
  }

  if (!userIsActive && statusAssinatura === 'pendente_pagamento') {
    return {
      action: 'limpar_e_prosseguir',
      message: 'Lixo PIX encontrado.',
      userId: user.id,
      authUid: user.auth_uid,
    };
  }

  return {
    action: 'bloqueado_em_uso',
    message: mensagem
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

export async function iniciaRegistroPlanoGratuito(
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
      throw new AppError(userStatus.message, 400);
    }

    if (userStatus.action === "limpar_e_prosseguir") {
      await rollbackCadastro({
        usuarioId: userStatus.userId,
        authUid: userStatus.authUid,
      });
    }

    const { data: plano, error: planoError } = await supabaseAdmin
      .from("planos")
      .select("id, slug")
      .eq("id", payload.plano_id)
      .single();

    if (planoError || !plano) throw new AppError("Plano selecionado não foi encontrado.", 404);

    const usuario = await criarUsuario(payload);
    usuarioId = usuario.id;

    const session = await criarUsuarioAuth(email, payload.senha, usuario.id);
    authUid = session.user.id;

    const { data: assinatura, error: assinaturaError } = await supabaseAdmin
      .from("assinaturas_usuarios")
      .insert({
        usuario_id: usuarioId,
        plano_id: plano.id,
        ativo: true,
        status: ASSINATURA_USUARIO_STATUS_ATIVA,
        preco_aplicado: 0,
      })
      .select()
      .single();

    if (assinaturaError) throw assinaturaError;

    // Notificação de Boas Vindas (Plano Gratuito)
    if (payload.telefone) {
        logger.info(`[AuthService] Enviando notificação de boas-vindas (Gratuito) para: ${payload.telefone}`);
        notificationService.notifyDriver(payload.telefone, DRIVER_EVENT_WELCOME_FREE, {
            nomeMotorista: payload.nome,
            nomePlano: "Gratuito",
            valor: 0,
            dataVencimento: new Date().toISOString().split('T')[0],
            pixPayload: undefined
        })
        .then(() => logger.info(`[AuthService] Notificação de boas-vindas (Gratuito) enviada com sucesso.`))
        .catch(err => logger.error({ err }, `Falha ao enviar boas vindas (Gratuito)`));
    }

    return { success: true, session };
  } catch (err: any) {
    if (usuarioId) await rollbackCadastro({ usuarioId, authUid, assinaturaId });
    if (err instanceof AppError) throw err;
    
    const errorMessage = err.message.includes("já está em uso")
      ? err.message
      : err.message || "Erro desconhecido ao processar registro.";
    throw new AppError(errorMessage, 400);
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
      throw new AppError(userStatus.message, 400);
    }

    if (userStatus.action === "limpar_e_prosseguir") {
      await rollbackCadastro({
        usuarioId: userStatus.userId,
        authUid: userStatus.authUid,
      });
    }

    const { data: plano, error: planoError } = await supabaseAdmin
      .from("planos")
      .select("id, slug, preco, trial_days, promocao_ativa, preco_promocional")
      .eq("id", payload.plano_id)
      .single();

    if (planoError || !plano) throw new AppError("Plano selecionado não foi encontrado.", 404);

    const usuario = await criarUsuario(payload);
    usuarioId = usuario.id;

    const session = await criarUsuarioAuth(email, payload.senha, usuario.id);
    authUid = session.user.id;

    const precoAplicado = plano.promocao_ativa ? plano.preco_promocional : plano.preco;
    const precoOrigem = plano.promocao_ativa ? "promocional" : "normal";

    const hoje = new Date();
    const anchorDate = hoje.toISOString().split("T")[0];

    // Modificado para usar configuração dinâmica ou valor do plano
    const trialDays = await getConfigNumber(CONFIG_KEY_TRIAL_DIAS_ESSENCIAL, plano.trial_days);

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
        status: ASSINATURA_USUARIO_STATUS_TRIAL,
        billing_mode: BillingMode.MANUAL,
        preco_aplicado: precoAplicado,
        preco_origem: precoOrigem,
        anchor_date: anchorDate,
        vigencia_fim: null, // NULL até o primeiro pagamento (preenchido pelo webhook)
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
        status: ASSINATURA_COBRANCA_STATUS_PENDENTE_PAGAMENTO,
        data_vencimento: dataVencimentoCobranca,
        origem: "inter",
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

        if (plano.slug === PLANO_GRATUITO) {
            eventType = DRIVER_EVENT_WELCOME_FREE;
        } else if (trialDays > 0) {
            eventType = DRIVER_EVENT_WELCOME_TRIAL;
            extraData = { trialDays };
        } else {
            // Plano Pago sem Trial (Imediato)
            eventType = DRIVER_EVENT_ACTIVATION;
        }

        if (eventType) {
            logger.info(`[AuthService] Enviando notificação tipo: ${eventType}`);
            notificationService.notifyDriver(payload.telefone, eventType, {
                nomeMotorista: payload.nome,
                nomePlano: plano.slug === PLANO_GRATUITO ? "Gratuito" : (plano.slug === PLANO_PROFISSIONAL ? "Profissional" : "Essencial"),
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
    if (err instanceof AppError) throw err;

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
      throw new AppError(userStatus.message, 400);
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
          "id, nome, preco, preco_promocional, promocao_ativa, franquia_cobrancas_mes"
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
        status: ASSINATURA_USUARIO_STATUS_PENDENTE_PAGAMENTO,
        billing_mode: BillingMode.AUTOMATICO,
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

    // --- REFATORADO: Uso do CobrancaService para gerar Cobrança e PIX ---
    // Removemos a lógica manual de insert + interService + update daqui.
    
    // Preparar descrição
    const descricaoCobranca = `Ativação de Assinatura - Plano ${planoSelecionado.nome}`;

    const activationResult = await cobrancaService.gerarCobrancaAtivacao({
        usuarioId: usuarioId!,
        assinaturaId: assinaturaId!,
        valor: precoAplicado,
        dataVencimento: dataVencimentoCobranca,
        descricao: descricaoCobranca,
        cpfResponsavel: cpf,
        nomeResponsavel: payload.nome
    });

    cobrancaId = activationResult.cobranca.id;
    const pixData = activationResult.pixData; // Já vem formatado { qrCode, qrCodeUrl, inter_txid }

    // Notificação de Boas Vindas (Profissional - Ativação Imediata)
    if (payload.telefone) {
        logger.info(`[AuthService] Enviando notificação de boas-vindas (Profissional) para: ${payload.telefone}`);
        notificationService.notifyDriver(payload.telefone, DRIVER_EVENT_ACTIVATION, {
            nomeMotorista: payload.nome,
            nomePlano: "Profissional",
            valor: precoAplicado,
            dataVencimento: dataVencimentoCobranca,
            pixPayload: pixData.qrCode
        })
        .then(() => logger.info(`[AuthService] Notificação de boas-vindas (Profissional) enviada com sucesso.`))
        .catch(err => logger.error({ err }, `Falha ao enviar boas vindas (Profissional)`));
    }

    return { 
        success: true, 
        session, 
        pix: { 
            qrCode: pixData.qrCode, 
            qrCodeUrl: pixData.qrCodeUrl 
        } 
    };
  } catch (err: any) {
    if (usuarioId) await rollbackCadastro({ usuarioId, authUid, assinaturaId, cobrancaId });
    if (err instanceof AppError) throw err;

    const errorMessage = err.message.includes("já está em uso")
      ? err.message
      : err.message || "Erro desconhecido ao processar registro Profissional.";
    throw new AppError(errorMessage, 400);
  }
}

