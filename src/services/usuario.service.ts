import { ASSINATURA_COBRANCA_STATUS_CANCELADA, ASSINATURA_COBRANCA_STATUS_PENDENTE_PAGAMENTO, ASSINATURA_USUARIO_STATUS_ATIVA, ASSINATURA_USUARIO_STATUS_PENDENTE_PAGAMENTO, ASSINATURA_USUARIO_STATUS_TRIAL, PLANO_COMPLETO, PLANO_ESSENCIAL, PLANO_GRATUITO } from "../config/contants.js";
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { cleanString, onlyDigits } from "../utils/utils.js";
import { interService } from "./inter.service.js";
import { passageiroService } from "./passageiro.service.js";

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
  quantidade_personalizada?: number; // Para plano Completo personalizado
  ativo?: boolean;
}

export interface RegistroAutomaticoResult {
  qrCodePayload: string;
  location: string;
  inter_txid: string;
  cobrancaId: string;
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
    throw new Error("Erro interno ao validar registro.");
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
    throw new Error("Erro ao buscar status da assinatura.");
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

export async function criarUsuario(data: UsuarioPayload) {
  const { nome, apelido, email, cpfcnpj, telefone, ativo = false } = data;

  const { data: usuario, error } = await supabaseAdmin
    .from("usuarios")
    .insert([{
      nome: cleanString(nome, true),
      apelido: cleanString(apelido ?? "", true),
      email: cleanString(email).toLowerCase(),
      cpfcnpj: onlyDigits(cpfcnpj),
      telefone: onlyDigits(telefone),
      ativo,
      role: "motorista",
    }])
    .select("id, auth_uid")
    .single();

  if (error) {
    logger.error({ error: error.message }, "Falha ao criar usuário no DB.");
    throw error;
  }
  return usuario;
}

export async function criarUsuarioAuth(
  email: string,
  senha: string,
  usuario_id: string
): Promise<AuthSession> {

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { role: "motorista", usuario_id },
  });

  if (authError || !authData?.user) {
    logger.error({ error: authError?.message }, "Falha ao criar usuário Auth.");
    throw new Error(authError?.message || "Erro ao criar usuário de autenticação");
  }

  const { error: updateError } = await supabaseAdmin
    .from("usuarios")
    .update({ auth_uid: authData.user.id })
    .eq("id", usuario_id);

  if (updateError) {
    logger.error({ error: updateError.message }, "Falha ao vincular Auth UID.");
    throw new Error("Falha ao vincular Auth UID ao usuário.");
  }

  const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password: senha,
  });

  if (sessionError || !sessionData?.session) {
    logger.error({ error: sessionError?.message }, "Falha ao gerar sessão de autenticação.");
    throw new Error("Falha ao gerar sessão de autenticação.");
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
      throw new Error(userStatus.message);
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

    if (planoError || !plano) throw new Error("Plano selecionado não foi encontrado.");

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

    return { success: true, session };
  } catch (err: any) {
    await rollbackCadastro({ usuarioId, authUid, assinaturaId });
    const errorMessage = err.message.includes("já está em uso")
      ? err.message
      : err.message || "Erro desconhecido ao processar registro.";
    throw new Error(errorMessage);
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
      throw new Error(userStatus.message);
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

    if (planoError || !plano) throw new Error("Plano selecionado não foi encontrado.");

    const usuario = await criarUsuario(payload);
    usuarioId = usuario.id;

    const session = await criarUsuarioAuth(email, payload.senha, usuario.id);
    authUid = session.user.id;

    const precoAplicado = plano.promocao_ativa ? plano.preco_promocional : plano.preco;
    const precoOrigem = plano.promocao_ativa ? "promocional" : "normal";

    const hoje = new Date();
    const anchorDate = hoje.toISOString().split("T")[0];

    const trialEndAt = (() => {
      if (plano.trial_days > 0) {
        const end = new Date();
        end.setDate(end.getDate() + plano.trial_days);
        return end.toISOString();
      }
      return null;
    })();

    // Para Plano Essencial em trial, vigencia_fim é NULL até o primeiro pagamento
    // Quando o usuário pagar a primeira cobrança, o webhook preencherá:
    // - vigencia_fim = data_pagamento + 1 mês
    // - anchor_date = data_pagamento (atualizado)
    const { data: assinatura, error: assinaturaError } = await supabaseAdmin
      .from("assinaturas_usuarios")
      .insert({
        usuario_id: usuarioId,
        plano_id: plano.id,
        ativo: true,
        status: ASSINATURA_USUARIO_STATUS_TRIAL,
        billing_mode: "manual",
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

    // Na contratação inicial, data de vencimento depende se tem trial:
    // - Se tem trial (Plano Essencial): data_vencimento = anchor_date + trial_days (fim do trial)
    // - Se não tem trial (Plano Completo): data_vencimento = anchor_date (hoje)
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
        billing_type: "upgrade",
      })
      .select()
      .single();

    if (cobrancaError) throw cobrancaError;

    return { success: true, session };
  } catch (err: any) {
    await rollbackCadastro({ usuarioId, authUid, assinaturaId });
    const errorMessage = err.message.includes("já está em uso")
      ? err.message
      : err.message || "Erro desconhecido ao processar registro.";
    throw new Error(errorMessage);
  }
}

export async function iniciarRegistroPlanoCompleto(
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
      throw new Error(userStatus.message);
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
    let planoBaseId: string;

    if (payload.quantidade_personalizada) {
      // Buscar o plano base Completo
      const { data: planoCompletoBase, error: planoBaseError } = await supabaseAdmin
        .from("planos")
        .select("id")
        .eq("slug", PLANO_COMPLETO)
        .eq("tipo", "base")
        .single();

      if (planoBaseError || !planoCompletoBase) {
        throw new Error("Plano Completo não encontrado.");
      }

      planoBaseId = planoCompletoBase.id;
      const { precoCalculado, quantidadeMinima } = await calcularPrecoPersonalizado(payload.quantidade_personalizada);
      
      precoAplicado = precoCalculado;
      precoOrigem = "personalizado";
      franquiaContratada = payload.quantidade_personalizada;
      planoSelecionadoId = planoBaseId;
    } else {
      planoSelecionadoId = payload.sub_plano_id || payload.plano_id || "";
      const { data: plano, error: planoError } = await supabaseAdmin
        .from("planos")
        .select(
          "id, nome, preco, preco_promocional, promocao_ativa, franquia_cobrancas_mes"
        )
        .eq("id", planoSelecionadoId)
        .single();

      if (planoError || !plano) throw new Error("Erro ao encontrar o plano selecionado.");

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
        billing_mode: "automatico",
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
    // vigencia_fim = data de contratação + 1 mês (já calculado acima)
    const dataVencimentoCobranca = anchorDate;

    const { data: cobranca, error: cobrancaError } = await supabaseAdmin
      .from("assinaturas_cobrancas")
      .insert({
        usuario_id: usuarioId,
        assinatura_usuario_id: assinaturaId,
        valor: precoAplicado,
        status: ASSINATURA_COBRANCA_STATUS_PENDENTE_PAGAMENTO,
        data_vencimento: dataVencimentoCobranca,
        origem: "inter",
        billing_type: "upgrade",
      })
      .select()
      .single();

    if (cobrancaError) throw cobrancaError;

    const pixData = await interService.criarCobrancaPix(supabaseAdmin, {
      cobrancaId: cobranca.id,
      valor: precoAplicado,
      cpf,
      nome: payload.nome,
    });

    await supabaseAdmin
      .from("assinaturas_cobrancas")
      .update({
        inter_txid: pixData.interTransactionId,
        qr_code_payload: pixData.qrCodePayload,
        location_url: pixData.location,
      })
      .eq("id", cobranca.id);

    return {
      qrCodePayload: pixData.qrCodePayload,
      location: pixData.location,
      cobrancaId: cobranca.id,
      inter_txid: pixData.interTransactionId,
      session,
    };

  } catch (err: any) {
    await rollbackCadastro({ usuarioId, authUid, assinaturaId, cobrancaId });
    const errorMessage = err.message.includes("já está em uso")
      ? err.message
      : err.message || "Erro desconhecido ao processar registro.";
    throw new Error(errorMessage);
  }
}

export async function cancelarAssinatura(
  payload: { usuarioId: string }
): Promise<boolean> {
  const { usuarioId } = payload;

  if (!usuarioId) {
    throw new Error("ID do usuário é obrigatório para cancelamento.");
  }

  try {
    const { data: assinaturaAtual, error: findAssinaturaError } = await supabaseAdmin
      .from("assinaturas_usuarios")
      .select("id, status, plano_id")
      .eq("usuario_id", usuarioId)
      .eq("ativo", true)
      .single();

    if (findAssinaturaError || !assinaturaAtual) {
      return true;
    }

    // Cancelar apenas as cobranças de subscription pendentes da assinatura atual
    // Não cancelar cobranças de upgrade (deixar o usuário decidir se quer pagar ou não)
    await supabaseAdmin
      .from("assinaturas_cobrancas")
      .update({ status: ASSINATURA_COBRANCA_STATUS_CANCELADA })
      .eq("assinatura_usuario_id", assinaturaAtual.id)
      .eq("status", ASSINATURA_COBRANCA_STATUS_PENDENTE_PAGAMENTO)
      .eq("billing_type", "subscription");

    // Agendar cancelamento (não alterar status ainda - a automação fará isso na vigencia_fim)
    await supabaseAdmin
      .from("assinaturas_usuarios")
      .update({
        status_anterior: assinaturaAtual.status, // Armazena para caso desista do cancelamento
        cancelamento_manual: new Date().toISOString(), // Data do agendamento
        updated_at: new Date().toISOString()
        // status e ativo permanecem inalterados - a automação alterará na vigencia_fim
      })
      .eq("id", assinaturaAtual.id);

    return true;
  } catch (err: any) {
    logger.error({ error: err.message, usuarioId }, "Falha no agendamento de cancelamento.");
    throw new Error(err.message || "Erro desconhecido ao agendar cancelamento.");
  }
}

export async function desistirCancelarAssinatura(usuarioId: string): Promise<boolean> {
  if (!usuarioId) {
    throw new Error("ID do usuário é obrigatório para desfazer cancelamento.");
  }

  try {
    // Buscar assinatura com cancelamento agendado (cancelamento_manual preenchido)
    // O status ainda não foi alterado para CANCELADA - isso será feito pela automação
    const { data: assinaturaAtual, error: findAssinaturaError } = await supabaseAdmin
      .from("assinaturas_usuarios")
      .select("id, status, status_anterior")
      .eq("usuario_id", usuarioId)
      .not("cancelamento_manual", "is", null) // Tem cancelamento agendado
      .eq("ativo", true) // Ainda está ativa (automação ainda não rodou)
      .single();

    if (findAssinaturaError || !assinaturaAtual) {
      logger.warn({ usuarioId, error: findAssinaturaError?.message }, "Nenhuma assinatura ativa com cancelamento agendado encontrada.");
      return true;
    }

    // Reverter apenas cobranças de subscription canceladas e não pagas para pendente_pagamento
    // Não reativar cobranças já pagas ou de upgrade
    await supabaseAdmin
      .from("assinaturas_cobrancas")
      .update({ status: ASSINATURA_COBRANCA_STATUS_PENDENTE_PAGAMENTO })
      .eq("assinatura_usuario_id", assinaturaAtual.id)
      .eq("status", ASSINATURA_COBRANCA_STATUS_CANCELADA)
      .eq("billing_type", "subscription")
      .is("data_pagamento", null);

    // Limpar campos de cancelamento agendado
    // O status não precisa ser revertido pois nunca foi alterado (ainda está no status original)
    await supabaseAdmin
      .from("assinaturas_usuarios")
      .update({
        cancelamento_manual: null,
        status_anterior: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", assinaturaAtual.id);

    return true;

  } catch (err: any) {
    logger.error({ error: err.message, usuarioId }, "Falha ao desfazer cancelamento.");
    throw new Error(err.message || "Erro desconhecido ao desfazer cancelamento.");
  }
}

export interface UpgradePlanoResult {
  qrCodePayload?: string;
  location?: string;
  inter_txid?: string;
  cobrancaId?: string;
  success?: boolean;
  precisaSelecaoManual?: boolean;
  tipo?: "upgrade" | "downgrade";
  franquia?: number;
  ativados?: number;
  planoId?: string;
  precoAplicado?: number;
  precoOrigem?: string;
}

export interface DowngradePlanoResult {
  success: boolean;
}

export interface TrocaSubplanoResult {
  qrCodePayload?: string;
  location?: string;
  inter_txid?: string;
  cobrancaId?: string;
  success: boolean;
  precisaSelecaoManual?: boolean;
  tipo?: "upgrade" | "downgrade";
  franquia?: number;
  ativados?: number;
  subplanoId?: string; // Para fazer o downgrade depois quando precisar seleção manual
  precoAplicado?: number;
  precoOrigem?: string;
}

export interface CriarAssinaturaPersonalizadaResult {
  qrCodePayload?: string;
  location?: string;
  inter_txid?: string;
  cobrancaId?: string;
  success?: boolean;
  precisaSelecaoManual?: boolean;
  tipo?: "upgrade" | "downgrade";
  franquia?: number;
  ativados?: number;
  precoAplicado?: number;
  precoOrigem?: string;
  quantidadePersonalizada?: number;
}

/**
 * Helper para obter assinatura ativa do usuário
 */
async function getAssinaturaAtiva(usuarioId: string) {
  const { data: assinaturas, error } = await supabaseAdmin
    .from("assinaturas_usuarios")
    .select(`
      *,
      planos:plano_id (*, parent:parent_id (*))
    `)
    .eq("usuario_id", usuarioId)
    .eq("ativo", true);

  if (error) {
    logger.error({ error: error.message, usuarioId }, "Erro ao buscar assinatura ativa");
    throw new Error("Erro ao buscar assinatura ativa.");
  }

  if (!assinaturas || assinaturas.length === 0) {
    logger.warn({ usuarioId }, "Nenhuma assinatura ativa encontrada");
    throw new Error("Assinatura ativa não encontrada.");
  }

  // Se houver múltiplas, pegar a mais recente
  const assinatura = assinaturas.length > 1 
    ? assinaturas.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    : assinaturas[0];

  return assinatura;
}

/**
 * Helper para cancelar cobrança pendente
 */
async function cancelarCobrancaPendente(usuarioId: string) {
  const { error } = await supabaseAdmin
    .from("assinaturas_cobrancas")
    .update({ status: ASSINATURA_COBRANCA_STATUS_CANCELADA })
    .eq("usuario_id", usuarioId)
    .eq("status", ASSINATURA_COBRANCA_STATUS_PENDENTE_PAGAMENTO);

  if (error) {
    logger.warn({ error: error.message, usuarioId }, "Erro ao cancelar cobrança pendente (pode não existir)");
  }
}

/**
 * Helper para limpar assinaturas pendentes antigas do usuário
 * Remove assinaturas com status "pendente_pagamento" e ativo = false
 * Também remove/cancela as cobranças vinculadas
 */
async function limparAssinaturasPendentes(usuarioId: string) {
  try {
    // Buscar assinaturas pendentes
    const { data: assinaturasPendentes, error: findError } = await supabaseAdmin
      .from("assinaturas_usuarios")
      .select("id")
      .eq("usuario_id", usuarioId)
      .eq("status", ASSINATURA_USUARIO_STATUS_PENDENTE_PAGAMENTO)
      .eq("ativo", false);

    if (findError) {
      logger.warn({ error: findError.message, usuarioId }, "Erro ao buscar assinaturas pendentes");
      return;
    }

    if (!assinaturasPendentes || assinaturasPendentes.length === 0) {
      return; // Nenhuma pendente para limpar
    }

    const assinaturaIds = assinaturasPendentes.map((a) => a.id);

    // Cancelar cobranças vinculadas
    await supabaseAdmin
      .from("assinaturas_cobrancas")
      .update({ status: ASSINATURA_COBRANCA_STATUS_CANCELADA })
      .in("assinatura_usuario_id", assinaturaIds)
      .eq("status", ASSINATURA_COBRANCA_STATUS_PENDENTE_PAGAMENTO);

    // Remover assinaturas pendentes
    const { error: deleteError } = await supabaseAdmin
      .from("assinaturas_usuarios")
      .delete()
      .in("id", assinaturaIds);

    if (deleteError) {
      logger.warn({ error: deleteError.message, usuarioId }, "Erro ao remover assinaturas pendentes");
    } else {
      logger.info({ usuarioId, quantidade: assinaturasPendentes.length }, "Assinaturas pendentes removidas");
    }
  } catch (err: any) {
    logger.warn({ error: err.message, usuarioId }, "Erro ao limpar assinaturas pendentes");
  }
}

/**
 * Helper para obter dados do usuário
 */
async function getUsuarioData(usuarioId: string) {
  const { data: usuario, error } = await supabaseAdmin
    .from("usuarios")
    .select("id, nome, cpfcnpj")
    .eq("id", usuarioId)
    .single();

  if (error || !usuario) {
    throw new Error("Usuário não encontrado.");
  }

  return usuario;
}

/**
 * Helper para determinar se é upgrade ou downgrade baseado nos slugs
 */
function isUpgrade(slugAtual: string, slugNovo: string): boolean {
  const ordem: Record<string, number> = {
    [PLANO_GRATUITO]: 1,
    [PLANO_ESSENCIAL]: 2,
    [PLANO_COMPLETO]: 3,
  };

  const ordemAtual = ordem[slugAtual] || 0;
  const ordemNova = ordem[slugNovo] || 0;

  return ordemNova > ordemAtual;
}

/**
 * Calcula o preço para um plano Completo personalizado
 * Fórmula: Preço do maior subplano + (Quantidade - franquia_maior_subplano) * preço do maior subplano
 * 
 * @param quantidade - Quantidade de cobranças desejada (mínimo: franquia do maior subplano + 1)
 * @returns Objeto com precoCalculado e quantidadeMinima
 */
async function calcularPrecoPersonalizado(quantidade: number): Promise<{
  precoCalculado: number;
  quantidadeMinima: number;
}> {
  // Buscar o plano base Completo
  const { data: planoCompletoBase, error: planoBaseError } = await supabaseAdmin
    .from("planos")
    .select("id")
    .eq("slug", PLANO_COMPLETO)
    .eq("tipo", "base")
    .single();

  if (planoBaseError || !planoCompletoBase) {
    throw new Error("Plano Completo não encontrado.");
  }

  // Buscar o maior subplano para usar como base
  const { data: subplanos, error: subplanosError } = await supabaseAdmin
    .from("planos")
    .select("id, preco, preco_promocional, promocao_ativa, franquia_cobrancas_mes")
    .eq("parent_id", planoCompletoBase.id)
    .eq("tipo", "sub")
    .order("franquia_cobrancas_mes", { ascending: false })
    .limit(1);

  if (subplanosError || !subplanos || subplanos.length === 0) {
    throw new Error("Subplanos do Completo não encontrados.");
  }

  const maiorSubplano = subplanos[0];
  const franquiaBase = maiorSubplano.franquia_cobrancas_mes || 0;
  const quantidadeMinima = franquiaBase + 1; // Mínimo = maior subplano + 1

  // Validar quantidade mínima
  if (quantidade < quantidadeMinima) {
    throw new Error(`A quantidade mínima é ${quantidadeMinima} cobranças (maior subplano: ${franquiaBase} + 1).`);
  }
  
  // Preço do maior subplano (usar promocional se ativo)
  const precoBase = Number(
    maiorSubplano.promocao_ativa 
      ? (maiorSubplano.preco_promocional ?? maiorSubplano.preco)
      : maiorSubplano.preco
  );

  // Calcular preço: base + (quantidade - franquia_base) * base
  const cobrancasAdicionais = quantidade - franquiaBase;
  const precoCalculado = precoBase + (cobrancasAdicionais * precoBase);

  return {
    precoCalculado: Math.round(precoCalculado * 100) / 100, // Arredondar para 2 casas decimais
    quantidadeMinima,
  };
}

/**
 * Helper: Calcula preços e franquia de um plano
 * @param plano - Objeto do plano com campos de preço e franquia
 * @returns Objeto com precoAplicado, precoOrigem e franquiaContratada
 */
function calcularPrecosEFranquia(plano: any): {
  precoAplicado: number;
  precoOrigem: string;
  franquiaContratada: number;
} {
  const precoAplicado = Number(
    plano.promocao_ativa ? plano.preco_promocional ?? plano.preco : plano.preco
  );
  const precoOrigem = plano.promocao_ativa ? "promocional" : "normal";
  const franquiaContratada = plano.franquia_cobrancas_mes || 0;

  return {
    precoAplicado,
    precoOrigem,
    franquiaContratada,
  };
}

/**
 * Upgrade de plano
 * - Cancela cobrança pendente
 * - Gera nova cobrança imediata
 * - Desativa assinatura atual
 * - Cria nova assinatura (ativa = false até pagamento)
 * - Mantém vigência original
 */
export async function upgradePlano(
  usuarioId: string,
  novoPlanoId: string
): Promise<UpgradePlanoResult> {
  try {
    // Buscar assinatura ativa
    const assinaturaAtual = await getAssinaturaAtiva(usuarioId);
    const planoAtual = assinaturaAtual.planos as any;

    // Buscar novo plano
    const { data: novoPlano, error: planoError } = await supabaseAdmin
      .from("planos")
      .select("id, slug, nome, preco, preco_promocional, promocao_ativa, franquia_cobrancas_mes")
      .eq("id", novoPlanoId)
      .single();

    if (planoError || !novoPlano) {
      throw new Error("Plano selecionado não encontrado.");
    }

    // Se o plano atual é um subplano (tem parent), usar o slug do parent para comparação
    const slugAtual = (planoAtual.parent as any)?.slug || planoAtual.slug;

    // Validar que é upgrade
    if (!isUpgrade(slugAtual, novoPlano.slug)) {
      throw new Error("Esta operação não é um upgrade. Use o endpoint de downgrade.");
    }

    // Limpar assinaturas pendentes antigas (garante que só há uma pendente por vez)
    await limparAssinaturasPendentes(usuarioId);

    // Calcular preços e franquia do novo plano
    const { precoAplicado, precoOrigem, franquiaContratada } = calcularPrecosEFranquia(novoPlano);

    // Manter vigência original (incluindo vigencia_fim)
    const anchorDate = assinaturaAtual.anchor_date || new Date().toISOString().split("T")[0];
    const vigenciaFim = assinaturaAtual.vigencia_fim || null;

    // NÃO desativar assinatura atual - ela permanece ativa até o pagamento ser confirmado

    // Criar nova assinatura (inativa até pagamento)
    const { data: novaAssinatura, error: assinaturaError } = await supabaseAdmin
      .from("assinaturas_usuarios")
      .insert({
        usuario_id: usuarioId,
        plano_id: novoPlano.id,
        franquia_contratada_cobrancas: franquiaContratada,
        ativo: false,
        status: ASSINATURA_USUARIO_STATUS_PENDENTE_PAGAMENTO,
        billing_mode: novoPlano.slug === PLANO_COMPLETO ? "automatico" : "manual",
        preco_aplicado: precoAplicado,
        preco_origem: precoOrigem,
        anchor_date: anchorDate,
        vigencia_fim: vigenciaFim,
      })
      .select()
      .single();

    if (assinaturaError) throw assinaturaError;

    // Criar cobrança
    const hoje = new Date();
    const { data: cobranca, error: cobrancaError } = await supabaseAdmin
      .from("assinaturas_cobrancas")
      .insert({
        usuario_id: usuarioId,
        assinatura_usuario_id: novaAssinatura.id,
        valor: precoAplicado,
        status: ASSINATURA_COBRANCA_STATUS_PENDENTE_PAGAMENTO,
        data_vencimento: hoje.toISOString().split("T")[0],
        origem: "inter",
        billing_type: "upgrade",
      })
      .select()
      .single();

    if (cobrancaError) throw cobrancaError;

    // Verificar se precisa seleção manual ANTES de gerar PIX
    let precisaSelecaoManual = false;
    if (novoPlano.slug === PLANO_COMPLETO) {
      const calculo = await passageiroService.calcularPassageirosDisponiveis(usuarioId, franquiaContratada);
      precisaSelecaoManual = calculo.precisaSelecaoManual;
    }

    // Se precisa seleção manual, retornar sem gerar PIX
    if (precisaSelecaoManual) {
      return {
        success: true,
        precisaSelecaoManual: true,
        tipo: "upgrade" as const,
        franquia: franquiaContratada,
        planoId: novoPlano.id,
        precoAplicado,
        precoOrigem,
        cobrancaId: cobranca.id,
      };
    }

    // Se não precisa seleção manual, gerar PIX normalmente
    const usuario = await getUsuarioData(usuarioId);
    const cpf = onlyDigits(usuario.cpfcnpj);

    const pixData = await interService.criarCobrancaPix(supabaseAdmin, {
      cobrancaId: cobranca.id,
      valor: precoAplicado,
      cpf,
      nome: usuario.nome,
    });

    await supabaseAdmin
      .from("assinaturas_cobrancas")
      .update({
        inter_txid: pixData.interTransactionId,
        qr_code_payload: pixData.qrCodePayload,
        location_url: pixData.location,
      })
      .eq("id", cobranca.id);

    // Não ativar passageiros aqui - será feito no webhook após confirmação do pagamento
    return {
      qrCodePayload: pixData.qrCodePayload,
      location: pixData.location,
      inter_txid: pixData.interTransactionId,
      cobrancaId: cobranca.id,
      success: true,
      precisaSelecaoManual: false,
    };

      return {
        qrCodePayload: pixData.qrCodePayload,
        location: pixData.location,
        inter_txid: pixData.interTransactionId,
        cobrancaId: cobranca.id,
        success: true,
      };

  } catch (err: any) {
    logger.error({ error: err.message, usuarioId, novoPlanoId }, "Falha no upgrade de plano.");
    throw new Error(err.message || "Erro desconhecido ao fazer upgrade de plano.");
  }
}

/**
 * Downgrade de plano
 * - Cancela cobrança pendente
 * - Desativa assinatura atual
 * - Cria nova assinatura ativa (sem cobrança)
 * - Mantém vigência original
 */
export async function downgradePlano(
  usuarioId: string,
  novoPlanoId: string
): Promise<DowngradePlanoResult> {
  try {
    // Buscar assinatura ativa
    const assinaturaAtual = await getAssinaturaAtiva(usuarioId);
    const planoAtual = assinaturaAtual.planos as any;

    // Buscar novo plano (incluir franquia_cobrancas_mes para planos Completo)
    const { data: novoPlano, error: planoError } = await supabaseAdmin
      .from("planos")
      .select("id, slug, nome, preco, preco_promocional, promocao_ativa, franquia_cobrancas_mes")
      .eq("id", novoPlanoId)
      .single();

    if (planoError || !novoPlano) {
      throw new Error("Plano selecionado não encontrado.");
    }

    // Se o plano atual é um subplano (tem parent), usar o slug do parent para comparação
    const slugAtual = (planoAtual.parent as any)?.slug || planoAtual.slug;

    // Validar que é downgrade
    if (isUpgrade(slugAtual, novoPlano.slug)) {
      throw new Error("Esta operação não é um downgrade. Use o endpoint de upgrade.");
    }

    // Cancelar cobrança pendente
    await cancelarCobrancaPendente(usuarioId);

    // Calcular preços e franquia do novo plano
    const { precoAplicado, precoOrigem, franquiaContratada } = calcularPrecosEFranquia(novoPlano);

    // Manter vigência original (incluindo vigencia_fim)
    const anchorDate = assinaturaAtual.anchor_date || new Date().toISOString().split("T")[0];
    const vigenciaFim = assinaturaAtual.vigencia_fim || null;

    // Log detalhado ANTES do insert
    const logData = {
      step: "ANTES_INSERT_DOWNGRADE_PLANO",
      novoPlano: {
        id: novoPlano.id,
        slug: novoPlano.slug,
        nome: novoPlano.nome,
        franquia_cobrancas_mes: novoPlano.franquia_cobrancas_mes,
        tipo_franquia: typeof novoPlano.franquia_cobrancas_mes
      },
      franquiaContratada,
      tipo_franquiaContratada: typeof franquiaContratada,
    };
    console.log("🔍 [DEBUG DOWNGRADE PLANO] Antes do insert:", JSON.stringify(logData, null, 2));
    logger.info(logData, "DEBUG: Antes do insert no downgrade de plano");

    // Desativar assinatura atual
    await supabaseAdmin
      .from("assinaturas_usuarios")
      .update({ ativo: false })
      .eq("id", assinaturaAtual.id);

    // Criar nova assinatura ativa (sem cobrança)
    const statusNovo = novoPlano.slug === PLANO_GRATUITO 
      ? ASSINATURA_USUARIO_STATUS_ATIVA 
      : (novoPlano.slug === PLANO_ESSENCIAL && assinaturaAtual.trial_end_at 
        ? ASSINATURA_USUARIO_STATUS_TRIAL 
        : ASSINATURA_USUARIO_STATUS_ATIVA);

    const { data: novaAssinatura, error: assinaturaError } = await supabaseAdmin
      .from("assinaturas_usuarios")
      .insert({
        usuario_id: usuarioId,
        plano_id: novoPlano.id,
        franquia_contratada_cobrancas: franquiaContratada,
        ativo: true,
        status: statusNovo,
        billing_mode: novoPlano.slug === PLANO_COMPLETO ? "automatico" : "manual",
        preco_aplicado: precoAplicado,
        preco_origem: precoOrigem,
        anchor_date: anchorDate,
        vigencia_fim: vigenciaFim,
        trial_end_at: novoPlano.slug === PLANO_ESSENCIAL && assinaturaAtual.trial_end_at 
          ? assinaturaAtual.trial_end_at 
          : null,
      })
      .select()
      .single();

    if (assinaturaError) {
      logger.error({ 
        error: assinaturaError, 
        objetoInsert: {
          usuario_id: usuarioId,
          plano_id: novoPlano.id,
          franquia_contratada_cobrancas: franquiaContratada,
        }
      }, "Erro ao inserir assinatura no downgrade de plano");
      throw assinaturaError;
    }

    // Log detalhado DEPOIS do insert
    const logDataAfter = {
      step: "DEPOIS_INSERT_DOWNGRADE_PLANO",
      assinaturaInserida: novaAssinatura,
      franquiaSalva: novaAssinatura?.franquia_contratada_cobrancas,
      tipo_franquiaSalva: typeof novaAssinatura?.franquia_contratada_cobrancas,
      comparacao: {
        valorEnviado: franquiaContratada,
        valorSalvo: novaAssinatura?.franquia_contratada_cobrancas,
        saoIguais: franquiaContratada === novaAssinatura?.franquia_contratada_cobrancas
      }
    };
    console.log("✅ [DEBUG DOWNGRADE PLANO] Depois do insert:", JSON.stringify(logDataAfter, null, 2));
    logger.info(logDataAfter, "DEBUG: Depois do insert no downgrade de plano");

    return { success: true };

  } catch (err: any) {
    logger.error({ error: err.message, usuarioId, novoPlanoId }, "Falha no downgrade de plano.");
    throw new Error(err.message || "Erro desconhecido ao fazer downgrade de plano.");
  }
}

/**
 * Troca de subplano (dentro do mesmo plano Completo)
 * - Se maior: gera cobrança da diferença
 * - Se menor: não gera cobrança (próxima fatura virá com valor reduzido)
 * - Cancela cobrança pendente se existir
 * - Mantém vigência original
 * - Se o usuário não estiver no Completo, faz upgrade para o Completo com o subplano escolhido
 */
export async function trocarSubplano(
  usuarioId: string,
  novoSubplanoId: string
): Promise<TrocaSubplanoResult> {
  try {
    // Buscar assinatura ativa
    const assinaturaAtual = await getAssinaturaAtiva(usuarioId);
    const planoAtual = assinaturaAtual.planos as any;

    // Verificar se está no plano Completo (pode ser o plano base ou um subplano)
    const isCompletoBase = planoAtual.slug === PLANO_COMPLETO;
    const isCompletoSub = !!planoAtual.parent_id;
    const estaNoCompleto = isCompletoBase || isCompletoSub;

    // Buscar novo subplano
    const { data: novoSubplano, error: planoError } = await supabaseAdmin
      .from("planos")
      .select("id, slug, nome, preco, preco_promocional, promocao_ativa, franquia_cobrancas_mes, parent_id")
      .eq("id", novoSubplanoId)
      .single();

    if (planoError || !novoSubplano) {
      throw new Error("Subplano selecionado não encontrado.");
    }

    // Validar que é subplano do Completo
    // Buscar o plano base Completo
    const { data: planoCompletoBase, error: planoBaseError } = await supabaseAdmin
      .from("planos")
      .select("id")
      .eq("slug", PLANO_COMPLETO)
      .eq("tipo", "base")
      .single();

    if (planoBaseError || !planoCompletoBase) {
      throw new Error("Plano Completo não encontrado.");
    }

    // Validar que o novo subplano pertence ao plano Completo
    if (novoSubplano.parent_id !== planoCompletoBase.id) {
      throw new Error("Subplano inválido. Deve pertencer ao plano Completo.");
    }

    // Se o usuário não está no Completo, fazer upgrade para o Completo com o subplano escolhido
    if (!estaNoCompleto) {
      // Fazer upgrade para o Completo com o subplano escolhido
      // Limpar assinaturas pendentes antigas
      await limparAssinaturasPendentes(usuarioId);

      // Calcular preços e franquia do novo subplano
      const { precoAplicado, precoOrigem, franquiaContratada } = calcularPrecosEFranquia(novoSubplano);

      // Manter vigência original (incluindo vigencia_fim)
      const anchorDate = assinaturaAtual.anchor_date || new Date().toISOString().split("T")[0];
      const vigenciaFim = assinaturaAtual.vigencia_fim || null;

      // Criar nova assinatura (inativa até pagamento)
      const { data: novaAssinatura, error: assinaturaError } = await supabaseAdmin
        .from("assinaturas_usuarios")
        .insert({
          usuario_id: usuarioId,
          plano_id: novoSubplano.id,
          franquia_contratada_cobrancas: franquiaContratada,
          ativo: false,
          status: ASSINATURA_USUARIO_STATUS_PENDENTE_PAGAMENTO,
          billing_mode: "automatico",
          preco_aplicado: precoAplicado,
          preco_origem: precoOrigem,
          anchor_date: anchorDate,
          vigencia_fim: vigenciaFim,
        })
        .select()
        .single();

      if (assinaturaError) throw assinaturaError;

      // Criar cobrança
      const hoje = new Date();
      const { data: cobranca, error: cobrancaError } = await supabaseAdmin
        .from("assinaturas_cobrancas")
        .insert({
          usuario_id: usuarioId,
          assinatura_usuario_id: novaAssinatura.id,
          valor: precoAplicado,
          status: ASSINATURA_COBRANCA_STATUS_PENDENTE_PAGAMENTO,
          data_vencimento: hoje.toISOString().split("T")[0],
          origem: "inter",
          billing_type: "upgrade",
        })
        .select()
        .single();

      if (cobrancaError) throw cobrancaError;

      // Verificar se precisa seleção manual ANTES de gerar PIX
      const calculo = await passageiroService.calcularPassageirosDisponiveis(usuarioId, franquiaContratada);
      
      if (calculo.precisaSelecaoManual) {
        return {
          success: true,
          precisaSelecaoManual: true,
          tipo: "upgrade" as const,
          franquia: franquiaContratada,
          subplanoId: novoSubplano.id,
          precoAplicado,
          precoOrigem,
          cobrancaId: cobranca.id,
        };
      }

      // Se não precisa seleção manual, gerar PIX normalmente
      const usuario = await getUsuarioData(usuarioId);
      const cpf = onlyDigits(usuario.cpfcnpj);

      const pixData = await interService.criarCobrancaPix(supabaseAdmin, {
        cobrancaId: cobranca.id,
        valor: precoAplicado,
        cpf,
        nome: usuario.nome,
      });

      await supabaseAdmin
        .from("assinaturas_cobrancas")
        .update({
          inter_txid: pixData.interTransactionId,
          qr_code_payload: pixData.qrCodePayload,
          location_url: pixData.location,
        })
        .eq("id", cobranca.id);

      // Não ativar passageiros aqui - será feito no webhook após confirmação do pagamento
      return {
        qrCodePayload: pixData.qrCodePayload,
        location: pixData.location,
        inter_txid: pixData.interTransactionId,
        cobrancaId: cobranca.id,
        success: true,
        precisaSelecaoManual: false,
      };
    }

    // Calcular preços e franquia do novo subplano (uma única vez)
    const { precoAplicado, precoOrigem, franquiaContratada } = calcularPrecosEFranquia(novoSubplano);

    // Calcular diferença (usuário já está no Completo)
    const precoAtual = Number(assinaturaAtual.preco_aplicado || 0);
    const diferenca = precoAplicado - precoAtual;
    const franquiaAtual = assinaturaAtual.franquia_contratada_cobrancas || 0;
    const isDowngrade = diferenca < 0 || (diferenca === 0 && franquiaContratada < franquiaAtual);

    // Se for downgrade, verificar ANTES de fazer qualquer alteração se precisa seleção manual
    if (isDowngrade) {
      const calculo = await passageiroService.calcularPassageirosDisponiveis(usuarioId, franquiaContratada);
      
      // Se tem mais passageiros ativos do que a nova franquia, precisa seleção manual
      if (calculo.jaAtivos > franquiaContratada) {
        return {
          success: true,
          precisaSelecaoManual: true,
          tipo: "downgrade" as const,
          franquia: franquiaContratada,
          subplanoId: novoSubplano.id, // Informação necessária para fazer o downgrade depois
        };
      }
    }

    // Manter vigência original (incluindo vigencia_fim)
    const anchorDate = assinaturaAtual.anchor_date || new Date().toISOString().split("T")[0];
    const vigenciaFim = assinaturaAtual.vigencia_fim || null;

    // Se for upgrade (diferença > 0), criar assinatura e cobrança
    if (diferenca > 0) {
      await limparAssinaturasPendentes(usuarioId);
      
      // Log detalhado ANTES do insert (para comparação com downgrade)
      const logDataUpgrade = { 
        step: "ANTES_INSERT_UPGRADE",
        novoSubplano: {
          id: novoSubplano.id, 
          nome: novoSubplano.nome,
          franquia_cobrancas_mes: novoSubplano.franquia_cobrancas_mes,
          tipo_franquia: typeof novoSubplano.franquia_cobrancas_mes
        },
        franquiaContratada,
        tipo_franquiaContratada: typeof franquiaContratada,
      };
      console.log("🔍 [DEBUG UPGRADE] Antes do insert:", JSON.stringify(logDataUpgrade, null, 2));
      logger.info(logDataUpgrade, "DEBUG: Antes do insert no upgrade");

      // NÃO desativar assinatura atual - ela permanece ativa até o pagamento ser confirmado
      // Criar nova assinatura (inativa até pagamento)
      const { data: novaAssinatura, error: assinaturaError } = await supabaseAdmin
        .from("assinaturas_usuarios")
        .insert({
          usuario_id: usuarioId,
          plano_id: novoSubplano.id,
          franquia_contratada_cobrancas: franquiaContratada,
          ativo: false,
          status: ASSINATURA_USUARIO_STATUS_PENDENTE_PAGAMENTO,
          billing_mode: "automatico",
          preco_aplicado: precoAplicado,
          preco_origem: precoOrigem,
          anchor_date: anchorDate,
          vigencia_fim: vigenciaFim,
        })
        .select()
        .single();

      if (assinaturaError) {
        logger.error({ 
          error: assinaturaError, 
          objetoInsert: {
            usuario_id: usuarioId,
            plano_id: novoSubplano.id,
            franquia_contratada_cobrancas: franquiaContratada,
          }
        }, "Erro ao inserir assinatura no upgrade");
        throw assinaturaError;
      }

      // Log detalhado DEPOIS do insert (para comparação com downgrade)
      const logDataUpgradeAfter = { 
        step: "DEPOIS_INSERT_UPGRADE",
        assinaturaInserida: novaAssinatura,
        franquiaSalva: novaAssinatura?.franquia_contratada_cobrancas,
        tipo_franquiaSalva: typeof novaAssinatura?.franquia_contratada_cobrancas,
        comparacao: {
          valorEnviado: franquiaContratada,
          valorSalvo: novaAssinatura?.franquia_contratada_cobrancas,
          saoIguais: franquiaContratada === novaAssinatura?.franquia_contratada_cobrancas
        }
      };
      console.log("✅ [DEBUG UPGRADE] Depois do insert:", JSON.stringify(logDataUpgradeAfter, null, 2));
      logger.info(logDataUpgradeAfter, "DEBUG: Depois do insert no upgrade");

      // Criar cobrança
      const hoje = new Date();
      const { data: cobranca, error: cobrancaError } = await supabaseAdmin
        .from("assinaturas_cobrancas")
        .insert({
          usuario_id: usuarioId,
          assinatura_usuario_id: novaAssinatura.id,
          valor: diferenca,
          status: ASSINATURA_COBRANCA_STATUS_PENDENTE_PAGAMENTO,
          data_vencimento: hoje.toISOString().split("T")[0],
          origem: "inter",
          billing_type: "upgrade",
        })
        .select()
        .single();

      if (cobrancaError) throw cobrancaError;

      // Verificar se precisa seleção manual ANTES de gerar PIX
      const calculo = await passageiroService.calcularPassageirosDisponiveis(usuarioId, franquiaContratada);
      
      if (calculo.precisaSelecaoManual) {
        return {
          success: true,
          precisaSelecaoManual: true,
          tipo: "upgrade" as const,
          franquia: franquiaContratada,
          subplanoId: novoSubplano.id,
          precoAplicado,
          precoOrigem,
          cobrancaId: cobranca.id,
        };
      }

      // Se não precisa seleção manual, gerar PIX normalmente
      const usuario = await getUsuarioData(usuarioId);
      const cpf = onlyDigits(usuario.cpfcnpj);

      const pixData = await interService.criarCobrancaPix(supabaseAdmin, {
        cobrancaId: cobranca.id,
        valor: diferenca,
        cpf,
        nome: usuario.nome,
      });

      await supabaseAdmin
        .from("assinaturas_cobrancas")
        .update({
          inter_txid: pixData.interTransactionId,
          qr_code_payload: pixData.qrCodePayload,
          location_url: pixData.location,
        })
        .eq("id", cobranca.id);

      // Não ativar passageiros aqui - será feito no webhook após confirmação do pagamento
      return {
        qrCodePayload: pixData.qrCodePayload,
        location: pixData.location,
        inter_txid: pixData.interTransactionId,
        cobrancaId: cobranca.id,
        success: true,
        precisaSelecaoManual: false,
      };
    } else {
      // Downgrade de subplano: não gerar cobrança, ativar imediatamente
      // Desativar assinatura atual
      await supabaseAdmin
        .from("assinaturas_usuarios")
        .update({ ativo: false })
        .eq("id", assinaturaAtual.id);

      // Manter vigência original (incluindo anchor_date e vigencia_fim)
      const anchorDate = assinaturaAtual.anchor_date || new Date().toISOString().split("T")[0];
      const vigenciaFim = assinaturaAtual.vigencia_fim || null;

      // Calcular preços e franquia do novo subplano
      const { precoAplicado, precoOrigem, franquiaContratada } = calcularPrecosEFranquia(novoSubplano);
      
      // Log detalhado ANTES do insert (usar console.log também para garantir visibilidade)
      const logData = { 
        step: "ANTES_INSERT_DOWNGRADE",
        novoSubplano: {
          id: novoSubplano.id, 
          nome: novoSubplano.nome,
          franquia_cobrancas_mes: novoSubplano.franquia_cobrancas_mes,
          tipo_franquia: typeof novoSubplano.franquia_cobrancas_mes
        },
        franquiaContratada,
        tipo_franquiaContratada: typeof franquiaContratada,
        objetoInsert: {
          usuario_id: usuarioId,
          plano_id: novoSubplano.id,
          franquia_contratada_cobrancas: franquiaContratada,
          ativo: true,
          status: ASSINATURA_USUARIO_STATUS_ATIVA,
          billing_mode: "automatico",
          preco_aplicado: precoAplicado,
          preco_origem: precoOrigem,
          anchor_date: anchorDate,
          vigencia_fim: vigenciaFim,
        }
      };
      console.log("🔍 [DEBUG DOWNGRADE] Antes do insert:", JSON.stringify(logData, null, 2));
      logger.info(logData, "DEBUG: Antes do insert no downgrade");
      
      // Criar nova assinatura (ativa imediatamente) - usar .select().single() como no upgrade
      const { data: novaAssinatura, error: assinaturaError } = await supabaseAdmin
        .from("assinaturas_usuarios")
        .insert({
          usuario_id: usuarioId,
          plano_id: novoSubplano.id,
          franquia_contratada_cobrancas: franquiaContratada,
          ativo: true,
          status: ASSINATURA_USUARIO_STATUS_ATIVA,
          billing_mode: "automatico",
          preco_aplicado: precoAplicado,
          preco_origem: precoOrigem,
          anchor_date: anchorDate,
          vigencia_fim: vigenciaFim,
        })
        .select()
        .single();

      if (assinaturaError) {
        logger.error({ 
          error: assinaturaError, 
          objetoInsert: {
            usuario_id: usuarioId,
            plano_id: novoSubplano.id,
            franquia_contratada_cobrancas: franquiaContratada,
          }
        }, "Erro ao inserir assinatura no downgrade");
        throw assinaturaError;
      }

      // Log detalhado DEPOIS do insert para verificar o que foi realmente salvo
      const logDataAfter = { 
        step: "DEPOIS_INSERT_DOWNGRADE",
        assinaturaInserida: novaAssinatura,
        franquiaSalva: novaAssinatura?.franquia_contratada_cobrancas,
        tipo_franquiaSalva: typeof novaAssinatura?.franquia_contratada_cobrancas,
        comparacao: {
          valorEnviado: franquiaContratada,
          valorSalvo: novaAssinatura?.franquia_contratada_cobrancas,
          saoIguais: franquiaContratada === novaAssinatura?.franquia_contratada_cobrancas
        }
      };
      console.log("✅ [DEBUG DOWNGRADE] Depois do insert:", JSON.stringify(logDataAfter, null, 2));
      logger.info(logDataAfter, "DEBUG: Depois do insert no downgrade");

      // Para downgrade, já verificamos antes. Se chegou aqui, não precisa seleção manual
      // Não precisa fazer nada com passageiros (já verificamos que não excede)
      return {
        success: true,
        precisaSelecaoManual: false,
      };
    }
  } catch (err: any) {
    logger.error({ error: err.message, usuarioId, novoSubplanoId }, "Falha na troca de subplano.");
    throw new Error(err.message || "Erro desconhecido ao trocar subplano.");
  }
}

/**
 * Cria assinatura do plano Completo com quantidade personalizada de cobranças
 * - Calcula preço baseado na quantidade
 * - Limpa assinaturas pendentes antigas
 * - Cria nova assinatura (ativa = false até pagamento)
 * - Gera cobrança PIX
 * - Mantém vigência original se houver assinatura atual
 */
/**
 * Cria ou atualiza assinatura do plano Completo com quantidade personalizada de cobranças
 * - Se for redução (downgrade): atualiza assinatura atual sem gerar cobrança
 * - Se for aumento (upgrade) ou novo usuário: gera cobrança PIX
 * - Mantém vigência original se houver assinatura atual
 */
export async function criarAssinaturaCompletoPersonalizado(
  usuarioId: string,
  quantidade: number
): Promise<CriarAssinaturaPersonalizadaResult> {
  try {
    // Calcular preço (já valida quantidade mínima internamente)
    const { precoCalculado } = await calcularPrecoPersonalizado(quantidade);

    // Buscar assinatura ativa (se houver)
    let assinaturaAtual = null;
    let isDowngrade = false;
    try {
      assinaturaAtual = await getAssinaturaAtiva(usuarioId);
      
      // Verificar se é a mesma quantidade já contratada (cobre tanto personalizado quanto sub-plano)
      const franquiaAtual = assinaturaAtual.franquia_contratada_cobrancas || 0;
      if (quantidade === franquiaAtual) {
        throw new Error("Você já possui esta quantidade de passageiros contratados.");
      }
      
      // Verificar se é redução (downgrade)
      isDowngrade = quantidade < franquiaAtual;
    } catch (err) {
      // Se o erro for sobre quantidade igual, propagar
      if (err instanceof Error && err.message.includes("já possui esta quantidade")) {
        throw err;
      }
      // Não tem assinatura ativa, continuar normalmente (será novo usuário)
    }

    // Buscar o plano base Completo
    const { data: planoCompletoBase, error: planoBaseError } = await supabaseAdmin
      .from("planos")
      .select("id")
      .eq("slug", PLANO_COMPLETO)
      .eq("tipo", "base")
      .single();

    if (planoBaseError || !planoCompletoBase) {
      throw new Error("Plano Completo não encontrado.");
    }

    // Se for downgrade, verificar ANTES de fazer qualquer alteração se precisa seleção manual
    if (isDowngrade && assinaturaAtual) {
      const calculo = await passageiroService.calcularPassageirosDisponiveis(usuarioId, quantidade);
      
      // Se tem mais passageiros ativos do que a nova franquia, precisa seleção manual
      if (calculo.jaAtivos > quantidade) {
        return {
          success: true,
          precisaSelecaoManual: true,
          tipo: "downgrade" as const,
          franquia: quantidade,
          quantidadePersonalizada: quantidade, // Informação necessária para fazer o downgrade depois
        };
      }

      // Se não precisa seleção manual, fazer o downgrade agora
      // Cancelar cobranças pendentes
      await cancelarCobrancaPendente(usuarioId);

      // Atualizar assinatura atual com nova quantidade e preço
      await supabaseAdmin
        .from("assinaturas_usuarios")
        .update({
          franquia_contratada_cobrancas: quantidade,
          preco_aplicado: precoCalculado,
          preco_origem: "personalizado",
          updated_at: new Date().toISOString(),
        })
        .eq("id", assinaturaAtual.id);

      // Não precisa fazer nada com passageiros (já verificamos que não excede)
      return {
        success: true,
        precisaSelecaoManual: false,
      };
    }

    // Se for upgrade ou novo usuário, criar assinatura e cobrança primeiro
    // Limpar assinaturas pendentes antigas (garante que só há uma pendente por vez)
    await limparAssinaturasPendentes(usuarioId);

    // Manter vigência original se houver assinatura atual
    const anchorDate = assinaturaAtual?.anchor_date || new Date().toISOString().split("T")[0];
    const vigenciaFim = assinaturaAtual?.vigencia_fim || null;

    // Criar nova assinatura (inativa até pagamento)
    // Usar o plano Completo base como plano_id, mas com franquia_contratada_cobrancas personalizada
    const { data: novaAssinatura, error: assinaturaError } = await supabaseAdmin
      .from("assinaturas_usuarios")
      .insert({
        usuario_id: usuarioId,
        plano_id: planoCompletoBase.id, // Plano Completo base
        franquia_contratada_cobrancas: quantidade, // Quantidade personalizada
        ativo: false,
        status: ASSINATURA_USUARIO_STATUS_PENDENTE_PAGAMENTO,
        billing_mode: "automatico",
        preco_aplicado: precoCalculado,
        preco_origem: "personalizado", // Indica que é um plano personalizado
        anchor_date: anchorDate,
        vigencia_fim: vigenciaFim,
      })
      .select()
      .single();

    if (assinaturaError) throw assinaturaError;

    // Criar cobrança
    // Se já tem assinatura ativa, é upgrade; senão, é subscription (novo usuário)
    const billingType = assinaturaAtual ? "upgrade" : "subscription";
    const hoje = new Date();
    const { data: cobranca, error: cobrancaError } = await supabaseAdmin
      .from("assinaturas_cobrancas")
      .insert({
        usuario_id: usuarioId,
        assinatura_usuario_id: novaAssinatura.id,
        valor: precoCalculado,
        status: ASSINATURA_COBRANCA_STATUS_PENDENTE_PAGAMENTO,
        data_vencimento: hoje.toISOString().split("T")[0],
        origem: "inter",
        billing_type: billingType,
      })
      .select()
      .single();

    if (cobrancaError) throw cobrancaError;

    // Verificar se precisa seleção manual ANTES de gerar PIX
    const calculo = await passageiroService.calcularPassageirosDisponiveis(usuarioId, quantidade);
    
    if (calculo.precisaSelecaoManual) {
      return {
        success: true,
        precisaSelecaoManual: true,
        tipo: "upgrade" as const,
        franquia: quantidade,
        quantidadePersonalizada: quantidade,
        precoAplicado: precoCalculado,
        precoOrigem: "personalizado",
        cobrancaId: cobranca.id,
      };
    }

    // Se não precisa seleção manual, gerar PIX normalmente
    const usuario = await getUsuarioData(usuarioId);
    const cpf = onlyDigits(usuario.cpfcnpj);

    const pixData = await interService.criarCobrancaPix(supabaseAdmin, {
      cobrancaId: cobranca.id,
      valor: precoCalculado,
      cpf,
      nome: usuario.nome,
    });

    await supabaseAdmin
      .from("assinaturas_cobrancas")
      .update({
        inter_txid: pixData.interTransactionId,
        qr_code_payload: pixData.qrCodePayload,
        location_url: pixData.location,
      })
      .eq("id", cobranca.id);

    // Não ativar passageiros aqui - será feito no webhook após confirmação do pagamento
    return {
      qrCodePayload: pixData.qrCodePayload,
      location: pixData.location,
      inter_txid: pixData.interTransactionId,
      cobrancaId: cobranca.id,
      success: true,
      precisaSelecaoManual: false,
    };

  } catch (err: any) {
    logger.error({ error: err.message, usuarioId, quantidade }, "Falha ao criar assinatura personalizada.");
    throw new Error(err.message || "Erro desconhecido ao criar assinatura personalizada.");
  }
}

/**
 * Função interna para fazer downgrade de subplano sem verificação de seleção manual
 */
async function fazerDowngradeSubplanoInterno(
  usuarioId: string,
  subplanoId: string
): Promise<void> {
  const assinaturaAtual = await getAssinaturaAtiva(usuarioId);
  
  // Buscar novo subplano
  const { data: novoSubplano, error: planoError } = await supabaseAdmin
    .from("planos")
    .select("id, slug, nome, preco, preco_promocional, promocao_ativa, franquia_cobrancas_mes, parent_id")
    .eq("id", subplanoId)
    .single();

  if (planoError || !novoSubplano) {
    throw new Error("Subplano selecionado não encontrado.");
  }
  
  // Cancelar cobranças pendentes
  await cancelarCobrancaPendente(usuarioId);

  // Desativar assinatura atual
  await supabaseAdmin
    .from("assinaturas_usuarios")
    .update({ ativo: false })
    .eq("id", assinaturaAtual.id);

  // Manter vigência original
  const anchorDate = assinaturaAtual.anchor_date || new Date().toISOString().split("T")[0];
  const vigenciaFim = assinaturaAtual.vigencia_fim || null;

  // Calcular preços e franquia do novo subplano
  const { precoAplicado, precoOrigem, franquiaContratada } = calcularPrecosEFranquia(novoSubplano);

  // Criar nova assinatura (ativa imediatamente)
  const { data: novaAssinatura, error: assinaturaError } = await supabaseAdmin
    .from("assinaturas_usuarios")
    .insert({
      usuario_id: usuarioId,
      plano_id: novoSubplano.id,
      franquia_contratada_cobrancas: franquiaContratada,
      ativo: true,
      status: ASSINATURA_USUARIO_STATUS_ATIVA,
      billing_mode: "automatico",
      preco_aplicado: precoAplicado,
      preco_origem: precoOrigem,
      anchor_date: anchorDate,
      vigencia_fim: vigenciaFim,
    })
    .select()
    .single();

  if (assinaturaError) {
    throw assinaturaError;
  }
}

/**
 * Função interna para fazer downgrade de quantidade personalizada sem verificação de seleção manual
 */
async function fazerDowngradePersonalizadoInterno(
  usuarioId: string,
  quantidade: number
): Promise<void> {
  const { precoCalculado } = await calcularPrecoPersonalizado(quantidade);
  const assinaturaAtual = await getAssinaturaAtiva(usuarioId);

  // Cancelar cobranças pendentes
  await cancelarCobrancaPendente(usuarioId);

  // Atualizar assinatura atual com nova quantidade e preço
  await supabaseAdmin
    .from("assinaturas_usuarios")
    .update({
      franquia_contratada_cobrancas: quantidade,
      preco_aplicado: precoCalculado,
      preco_origem: "personalizado",
      updated_at: new Date().toISOString(),
    })
    .eq("id", assinaturaAtual.id);
}

/**
 * Confirma downgrade com seleção manual de passageiros
 * Faz o downgrade E atualiza os passageiros de uma vez (atomicidade)
 */
export async function confirmarDowngradeComSelecao(
  usuarioId: string,
  passageiroIds: string[],
  franquia: number,
  tipoDowngrade: "subplano" | "personalizado",
  subplanoId?: string,
  quantidadePersonalizada?: number
): Promise<{ ativados: number; desativados: number }> {
  try {
    // Validações prévias ANTES de fazer qualquer alteração no banco
    // 1. Validar que todos os passageiros pertencem ao usuário e estão ativos
    const { data: todosPassageiros, error: passageirosError } = await supabaseAdmin
      .from("passageiros")
      .select("id")
      .eq("usuario_id", usuarioId)
      .eq("ativo", true);
    
    if (passageirosError) {
      throw new Error("Erro ao validar passageiros: " + passageirosError.message);
    }
    
    const idsValidos = todosPassageiros?.map((p: any) => p.id) || [];
    const idsInvalidos = passageiroIds.filter(id => !idsValidos.includes(id));
    
    if (idsInvalidos.length > 0) {
      throw new Error(`Passageiros inválidos ou não pertencem ao usuário: ${idsInvalidos.join(", ")}`);
    }
    
    // 2. Validar que a quantidade de passageiros selecionados não excede a franquia
    if (passageiroIds.length > franquia) {
      throw new Error(`Quantidade de passageiros selecionados (${passageiroIds.length}) excede a franquia (${franquia})`);
    }
    
    // 3. Validar que o tipo de downgrade e informações estão corretas
    if (tipoDowngrade === "subplano" && !subplanoId) {
      throw new Error("Subplano ID é obrigatório para downgrade de subplano");
    }
    
    if (tipoDowngrade === "personalizado" && !quantidadePersonalizada) {
      throw new Error("Quantidade personalizada é obrigatória para downgrade personalizado");
    }
    
    // 4. Validar que a assinatura atual existe
    const assinaturaAtual = await getAssinaturaAtiva(usuarioId);
    if (!assinaturaAtual) {
      throw new Error("Usuário não possui assinatura ativa");
    }
    
    // Agora que todas as validações passaram, executar as operações
    // Primeiro, fazer o downgrade (sem verificação de seleção manual)
    if (tipoDowngrade === "subplano" && subplanoId) {
      await fazerDowngradeSubplanoInterno(usuarioId, subplanoId);
    } else if (tipoDowngrade === "personalizado" && quantidadePersonalizada) {
      await fazerDowngradePersonalizadoInterno(usuarioId, quantidadePersonalizada);
    } else {
      throw new Error("Tipo de downgrade inválido ou informações faltando");
    }

    // Depois, atualizar os passageiros
    const resultado = await passageiroService.confirmarSelecaoPassageiros(
      usuarioId,
      passageiroIds,
      franquia
    );

    return resultado;
  } catch (err: any) {
    logger.error({ error: err.message, usuarioId, tipoDowngrade }, "Falha ao confirmar downgrade com seleção.");
    throw new Error(err.message || "Erro desconhecido ao confirmar downgrade com seleção.");
  }
}

/**
 * Gera PIX após confirmação de seleção manual de passageiros
 * Cria assinatura pendente, cobrança e gera PIX
 */
export async function gerarPixAposSelecaoManual(
  usuarioId: string,
  tipo: "upgrade" | "downgrade",
  precoAplicado: number,
  precoOrigem: string,
  planoId?: string,
  subplanoId?: string,
  quantidadePersonalizada?: number,
  cobrancaId?: string
): Promise<{ qrCodePayload: string; location: string; inter_txid: string; cobrancaId: string }> {
  try {
    // Se cobrancaId foi fornecido, usar a cobrança existente
    if (cobrancaId) {
      // Verificar se a cobrança existe e está pendente
      const { data: cobranca, error: cobrancaError } = await supabaseAdmin
        .from("assinaturas_cobrancas")
        .select("id, status, valor, usuario_id, qr_code_payload, inter_txid")
        .eq("id", cobrancaId)
        .eq("usuario_id", usuarioId)
        .eq("status", "pendente_pagamento")
        .single();

      if (cobrancaError || !cobranca) {
        throw new Error("Cobrança não encontrada ou não está pendente.");
      }

      // Se já tem PIX gerado, retornar dados existentes
      if (cobranca.qr_code_payload && cobranca.inter_txid) {
        return {
          qrCodePayload: cobranca.qr_code_payload,
          location: "",
          inter_txid: cobranca.inter_txid,
          cobrancaId: cobranca.id,
        };
      }

      // Gerar PIX para a cobrança existente
      const usuario = await getUsuarioData(usuarioId);
      const cpf = onlyDigits(usuario.cpfcnpj);

      const pixData = await interService.criarCobrancaPix(supabaseAdmin, {
        cobrancaId: cobranca.id,
        valor: Number(cobranca.valor),
        cpf,
        nome: usuario.nome,
      });

      await supabaseAdmin
        .from("assinaturas_cobrancas")
        .update({
          inter_txid: pixData.interTransactionId,
          qr_code_payload: pixData.qrCodePayload,
          location_url: pixData.location,
        })
        .eq("id", cobranca.id);

      return {
        qrCodePayload: pixData.qrCodePayload,
        location: pixData.location,
        inter_txid: pixData.interTransactionId,
        cobrancaId: cobranca.id,
      };
    }

    // Se não tem cobrancaId, criar nova (comportamento antigo - mantido para compatibilidade)
    // Buscar assinatura (ativa ou pendente) - se não houver, prosseguir (novo usuário)
    let assinaturaAtual;
    let assinaturaJaAtiva = false;
    try {
      assinaturaAtual = await getAssinaturaAtiva(usuarioId);
      assinaturaJaAtiva = true;
      
      // Se a assinatura já está ativa, não gerar PIX (pagamento já foi confirmado)
      throw new Error("Assinatura já está ativa. O pagamento já foi confirmado. Não é necessário gerar novo PIX.");
    } catch (error: any) {
      // Se o erro for sobre assinatura já ativa, propagar
      if (error.message.includes("já está ativa")) {
        throw error;
      }
      
      // Se não houver assinatura ativa, buscar pendente
      const { data: assinaturasPendentes } = await supabaseAdmin
        .from("assinaturas_usuarios")
        .select("*")
        .eq("usuario_id", usuarioId)
        .eq("status", ASSINATURA_USUARIO_STATUS_PENDENTE_PAGAMENTO)
        .order("created_at", { ascending: false })
        .limit(1);
      
      if (assinaturasPendentes && assinaturasPendentes.length > 0) {
        assinaturaAtual = assinaturasPendentes[0];
      } else {
        assinaturaAtual = null;
      }
    }
    
    // Limpar assinaturas pendentes antigas
    await limparAssinaturasPendentes(usuarioId);
    
    // Manter vigência original se houver assinatura anterior
    const anchorDate = assinaturaAtual?.anchor_date || new Date().toISOString().split("T")[0];
    const vigenciaFim = assinaturaAtual?.vigencia_fim || null;
    
    // Determinar plano_id e franquia
    let planoIdFinal: string;
    let franquiaContratada: number;
    
    if (quantidadePersonalizada) {
      const { data: planoCompletoBase, error: planoCompletoError } = await supabaseAdmin
        .from("planos")
        .select("id")
        .eq("slug", PLANO_COMPLETO)
        .is("parent_id", null)
        .single();
      
      if (planoCompletoError || !planoCompletoBase) {
        logger.error({ 
          error: planoCompletoError?.message, 
          usuarioId, 
          quantidadePersonalizada 
        }, "Erro do sistema: Plano Completo não encontrado ao gerar PIX após seleção manual");
        throw new Error("Erro do sistema: Plano Completo não encontrado. Por favor, entre em contato com o suporte.");
      }
      
      planoIdFinal = planoCompletoBase.id;
      franquiaContratada = quantidadePersonalizada;
    } else if (subplanoId) {
      planoIdFinal = subplanoId;
      const { data: subplano, error: subplanoError } = await supabaseAdmin
        .from("planos")
        .select("franquia_cobrancas_mes")
        .eq("id", subplanoId)
        .single();
      
      if (subplanoError || !subplano) {
        logger.error({ 
          error: subplanoError?.message, 
          usuarioId, 
          subplanoId 
        }, "Erro do sistema: Subplano não encontrado ao gerar PIX após seleção manual");
        throw new Error("Erro do sistema: Subplano não encontrado. Por favor, entre em contato com o suporte.");
      }
      
      franquiaContratada = subplano.franquia_cobrancas_mes || 0;
    } else if (planoId) {
      planoIdFinal = planoId;
      const { data: plano, error: planoError } = await supabaseAdmin
        .from("planos")
        .select("franquia_cobrancas_mes")
        .eq("id", planoId)
        .single();
      
      if (planoError || !plano) {
        logger.error({ 
          error: planoError?.message, 
          usuarioId, 
          planoId 
        }, "Erro do sistema: Plano não encontrado ao gerar PIX após seleção manual");
        throw new Error("Erro do sistema: Plano não encontrado. Por favor, entre em contato com o suporte.");
      }
      
      franquiaContratada = plano.franquia_cobrancas_mes || 0;
    } else {
      logger.error({ 
        usuarioId, 
        tipo, 
        planoId, 
        subplanoId, 
        quantidadePersonalizada 
      }, "Erro do sistema: Informações de plano insuficientes ao gerar PIX após seleção manual");
      throw new Error("Erro do sistema: Informações de plano insuficientes. Por favor, entre em contato com o suporte.");
    }
    
    // Criar nova assinatura (inativa até pagamento)
    const { data: novaAssinatura, error: assinaturaError } = await supabaseAdmin
      .from("assinaturas_usuarios")
      .insert({
        usuario_id: usuarioId,
        plano_id: planoIdFinal,
        franquia_contratada_cobrancas: franquiaContratada,
        ativo: false,
        status: ASSINATURA_USUARIO_STATUS_PENDENTE_PAGAMENTO,
        billing_mode: "automatico",
        preco_aplicado: precoAplicado,
        preco_origem: precoOrigem,
        anchor_date: anchorDate,
        vigencia_fim: vigenciaFim,
      })
      .select()
      .single()
    
    if (assinaturaError) throw assinaturaError;
    
    // Criar cobrança
    const hoje = new Date();
    const { data: cobranca, error: cobrancaError } = await supabaseAdmin
      .from("assinaturas_cobrancas")
      .insert({
        usuario_id: usuarioId,
        assinatura_usuario_id: novaAssinatura.id,
        valor: precoAplicado,
        status: ASSINATURA_COBRANCA_STATUS_PENDENTE_PAGAMENTO,
        data_vencimento: hoje.toISOString().split("T")[0],
        origem: "inter",
        billing_type: "upgrade",
      })
      .select()
      .single();
    
    if (cobrancaError) throw cobrancaError;
    
    // Gerar PIX
    const usuario = await getUsuarioData(usuarioId);
    const cpf = onlyDigits(usuario.cpfcnpj);
    
    const pixData = await interService.criarCobrancaPix(supabaseAdmin, {
      cobrancaId: cobranca.id,
      valor: precoAplicado,
      cpf,
      nome: usuario.nome,
    });
    
    await supabaseAdmin
      .from("assinaturas_cobrancas")
      .update({
        inter_txid: pixData.interTransactionId,
        qr_code_payload: pixData.qrCodePayload,
        location_url: pixData.location,
      })
      .eq("id", cobranca.id);
    
    return {
      qrCodePayload: pixData.qrCodePayload,
      location: pixData.location,
      inter_txid: pixData.interTransactionId,
      cobrancaId: cobranca.id,
    };
  } catch (err: any) {
    logger.error({ error: err.message, usuarioId, tipo }, "Falha ao gerar PIX após seleção manual.");
    throw new Error(err.message || "Erro desconhecido ao gerar PIX após seleção manual.");
  }
}