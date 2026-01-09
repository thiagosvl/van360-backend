import { randomUUID } from "crypto";
import { ASSINATURA_COBRANCA_STATUS_CANCELADA, ASSINATURA_COBRANCA_STATUS_PENDENTE_PAGAMENTO, ASSINATURA_USUARIO_STATUS_ATIVA, ASSINATURA_USUARIO_STATUS_PENDENTE_PAGAMENTO, ASSINATURA_USUARIO_STATUS_TRIAL, CONFIG_KEY_DIA_GERACAO_MENSALIDADES, DRIVER_EVENT_ACTIVATION, DRIVER_EVENT_UPGRADE, PLANO_ESSENCIAL, PLANO_GRATUITO, PLANO_PROFISSIONAL, TIPOS_CHAVE_PIX_VALIDOS, TipoChavePix } from "../config/constants.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { cleanString, onlyDigits } from "../utils/utils.js";
import { cobrancaService } from "./cobranca.service.js";
import { getBillingConfig, getConfigNumber } from "./configuracao.service.js";
import { interService } from "./inter.service.js";
import { notificationService } from "./notifications/notification.service.js";
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
  quantidade_personalizada?: number; // Para plano Profissional personalizado
  ativo?: boolean;
}

export interface RegistroAutomaticoResult {
  qrCodePayload: string;
  location: string;
  inter_txid: string;
  cobrancaId: string;
  valor: number;
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
      // role removido pois a coluna será depreciada
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
    user_metadata: { usuario_id }, // Role movida para app_metadata
    app_metadata: { role: "motorista" } // Strict Source of Truth
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
    // - Se não tem trial (Plano Profissional): data_vencimento = anchor_date (hoje)
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

    return { success: true, session };
  } catch (err: any) {
    await rollbackCadastro({ usuarioId, authUid, assinaturaId });
    const errorMessage = err.message.includes("já está em uso")
      ? err.message
      : err.message || "Erro desconhecido ao processar registro.";
    throw new Error(errorMessage);
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
    let planoSelecionado: any = null;

    if (payload.quantidade_personalizada) {
      const { data: planoProfissionalBase, error: planoBaseError } = await supabaseAdmin
        .from("planos")
        .select("id, nome")
        .eq("slug", PLANO_PROFISSIONAL)
        .eq("tipo", "base")
        .single();

      if (planoBaseError || !planoProfissionalBase) {
        throw new Error("Plano Profissional não encontrado.");
      }

      planoSelecionadoId = planoProfissionalBase.id;
      planoSelecionado = planoProfissionalBase;
      const { precoCalculado } = await calcularPrecoPersonalizado(payload.quantidade_personalizada);
      
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

      if (planoError || !plano) throw new Error("Erro ao encontrar o plano selecionado.");
      
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
        billing_type: "activation",
        descricao: `Ativação de Assinatura - Plano ${planoSelecionado.nome}`,
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
      valor: precoAplicado,
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

    // GHOST KILLER: Eliminar cobranças de passageiros futuras (Vencimento > Vigência Fim)
    // Isso garante que após o fim do acesso pago, nenhuma cobrança continue válida.
    try {
        // 1. Buscar a Assinatura completa (precisamos do vigencia_fim para saber o limite de direito)
        const { data: assinaturaCompleta } = await supabaseAdmin
            .from("assinaturas_usuarios")
            .select("vigencia_fim")
            .eq("id", assinaturaAtual.id)
            .single();

        // Se o cancelamento é agendado, a data de corte é o vigencia_fim.
        // Se por algum erro não tiver vigencia, usa HOJE (corte imediato).
        const dataCorte = assinaturaCompleta?.vigencia_fim ? new Date(assinaturaCompleta.vigencia_fim).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

        logger.info({ usuarioId, dataCorte }, "Iniciando verificação de Ghost Charges (Cobranças Futuras)");

        // 2. Buscar cobranças EXCEDENTES (Vencimento > Data Corte)
        const { data: cobrancasFantasmas } = await supabaseAdmin
            .from("cobrancas")
            .select("id, txid_pix, data_vencimento")
            .eq("usuario_id", usuarioId)
            .eq("status", "pendente") // Apenas as não pagas
            .gt("data_vencimento", dataCorte); // Maior estrito que a vigência

        // 3. Invalidar PIX e Cancelar no Banco
        if (cobrancasFantasmas && cobrancasFantasmas.length > 0) {
            logger.info({ count: cobrancasFantasmas.length }, "Eliminando Ghost Charges identificadas...");
            
            for (const cob of cobrancasFantasmas) {
                if (cob.txid_pix) {
                    try {
                        // Importação dinâmica ou uso direto se estiver importado. 
                        // Assumindo que interService já está importado ou disponível via global.
                        // Se não estiver importado no topo, precisarei adicionar import { interService } ...
                        await interService.cancelarCobrancaPix(supabaseAdmin, cob.txid_pix, "cobv");
                    } catch (pixErr) {
                        logger.warn({ pixErr, cobId: cob.id }, "Falha ao invalidar PIX Ghost (prosseguindo com cancelamento local)");
                    }
                }
            }

            const idsGhost = cobrancasFantasmas.map(c => c.id);
            await supabaseAdmin
                .from("cobrancas")
                .update({ status: "cancelada" })
                .in("id", idsGhost);
                
            logger.info({ ids: idsGhost }, "Ghost Charges canceladas com sucesso.");
        } else {
            logger.info("Nenhuma Ghost Charge encontrada para cancelamento.");
        }

    } catch (ghostError: any) {
        logger.error({ error: ghostError.message, usuarioId }, "Erro crítico na rotina Ghost Killer (cancelamento de assinatura parcial)");
        // Não lançar erro para não impedir o cancelamento da assinatura em si
    }

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

    // THE RESURRECTION: Regenerar cobranças futuras se estivermos pós-data de geração
    // Se o motorista cancelou, o Ghost Killer matou as cobranças futuras.
    // Agora que ele desistiu, precisamos recriá-las para não dar "Mês Grátis".
    try {
        const diaGeracao = await getConfigNumber(CONFIG_KEY_DIA_GERACAO_MENSALIDADES, 25);
        const hoje = new Date();

        if (hoje.getDate() >= diaGeracao) {
            logger.info({ usuarioId }, "Desistência de cancelamento tardia: Regenerando cobranças do próximo mês (Resurrection)...");
            
            const nextMonthDate = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
            const targetMonth = nextMonthDate.getMonth() + 1; // 1-12
            const targetYear = nextMonthDate.getFullYear();

            // Chama o serviço existente que gera em lote (ignora as já existentes, cria as que faltam)
            await cobrancaService.gerarCobrancasMensaisParaMotorista(
                usuarioId, 
                targetMonth, 
                targetYear
            );
        }
    } catch (resurrectionError: any) {
        logger.error({ error: resurrectionError.message, usuarioId }, "Erro ao regenerar cobranças na desistência do cancelamento.");
        // Não falhar o processo principal, apenas logar.
    }

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
    .select("id, nome, cpfcnpj, telefone")
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
    [PLANO_PROFISSIONAL]: 3,
  };

  const ordemAtual = ordem[slugAtual] || 0;
  const ordemNova = ordem[slugNovo] || 0;

  return ordemNova > ordemAtual;
}

/**
 * Calcula o preço para um plano Profissional personalizado
 * Fórmula: Preço do maior subplano + (Quantidade - franquia_maior_subplano) * preço do maior subplano
 * 
 * @param quantidade - Quantidade de cobranças desejada (mínimo: franquia do maior subplano + 1)
 * @returns Objeto com precoCalculado e quantidadeMinima
 */
export async function calcularPrecoPersonalizado(quantidade: number, ignorarMinimo: boolean = false): Promise<{
  precoCalculado: number;
  quantidadeMinima: number;
}> {
  console.log("DEBUG: calcularPrecoPersonalizado chamado", { quantidade, ignorarMinimo });

  // Buscar configurações de billing (apenas valores de blocos agora)
  const billingConfig = await getBillingConfig();

  // 1. Buscar o Plano Profissional (Pai)
  const { data: planoPai, error: planoPaiError } = await supabaseAdmin
    .from("planos")
    .select("id")
    .eq("slug", PLANO_PROFISSIONAL)
    .eq("tipo", "base")
    .single();

  if (planoPaiError || !planoPai) {
    throw new Error("Plano Profissional base não encontrado.");
  }

  // 2. Buscar TODOS os subplanos ordenados por franquia (Maior -> Menor)
  const { data: subplanos, error: subplanosError } = await supabaseAdmin
    .from("planos")
    .select("id, preco, preco_promocional, promocao_ativa, franquia_cobrancas_mes")
    .eq("parent_id", planoPai.id)
    .eq("tipo", "sub")
    .order("franquia_cobrancas_mes", { ascending: false });

  if (subplanosError || !subplanos || subplanos.length === 0) {
    throw new Error("Subplanos do Plano Profissional não encontrados.");
  }

  // 3. Determinar o Plano Base para Enterprise (O maior disponível)
  const planoBaseEnterprise = subplanos[0]; // Como ordenamos DESC, o primeiro é o maior
  const franquiaBase = planoBaseEnterprise.franquia_cobrancas_mes || 0;
  
  // -- LÓGICA ENTERPRISE (Acima da franquia do maior plano) --
  if (quantidade > franquiaBase) {
      console.log("DEBUG: Lógica Enterprise Ativada (Dinâmica)", { quantidade, franquiaBase, planoBaseId: planoBaseEnterprise.id });
      
      const precoBase = Number(
        planoBaseEnterprise.promocao_ativa 
          ? (planoBaseEnterprise.preco_promocional ?? planoBaseEnterprise.preco)
          : planoBaseEnterprise.preco
      );

      const excedente = quantidade - franquiaBase;
      const valorIncremento = billingConfig.valorIncrementoPassageiro ?? 2.50;
      
      const precoAdicional = excedente * valorIncremento;
      
      // Preço Final = Preço do Maior Plano + Adicionais
      const precoCalculado = precoBase + precoAdicional;
      
      return {
          precoCalculado: Math.round(precoCalculado * 100) / 100,
          quantidadeMinima: franquiaBase + 1
      };
  }

  //-- LÓGICA PADRÃO (Encaixe nos Subplanos existentes) --

  // Identificar limite mínimo do sistema
  // Como subplanos[0] é o maior, a lógica de minimo geral segue a mesma: maior + 1 (para ser enterprise)
  // Mas para planos menores, validamos se existe algum plano que atenda.
  const quantidadeMinima = franquiaBase + 1; // Para fins de "Enterprise", mas aqui estamos no flow padrão

  // Validação de Mínimo apenas se for estritamente um pedido Enterprise invalido
  // Se q=20 e planos=[90, 60, 25], 20 < 91 ok.

  // Lógica "Best Fit": Encontrar o plano mais adequado
  // Procura o MENOR plano que suporte a quantidade.
  // Ordenação atual: [90, 60, 25].
  // Queremos Q=50. 
  // 90 >= 50 (cand). 60 >= 50 (cand). 25 >= 50 (nao).
  // Dentre os candidatos, pegamos o último (menor franquia que atende).
  
  // Revertemos para ASC para facilitar "find" do menor que serve, ou usamos findLast em array DESC
  // Vamos filtrar os que servem e pegar o menor (menor preço/franquia)
  const candidatos = subplanos.filter(p => (p.franquia_cobrancas_mes || 0) >= quantidade);
  
  let planoReferencia;
  
  if (candidatos.length > 0) {
      // O último candidato é o menor plano que ainda suporta a quantidade (pois array original é DESC)
      planoReferencia = candidatos[candidatos.length - 1];
  } else {
      // Se ninguem suporta, seria Enterprise. Mas já passou pelo if (quantidade > franquiaBase).
      // Então teoricamente impossivel chegar aqui, salvo se quantidade < 0.
      // Fallback para o menor plano absoluto
      planoReferencia = subplanos[subplanos.length - 1];
  }

  const franquiaRef = planoReferencia.franquia_cobrancas_mes || 0;
  const precoRef = Number(
    planoReferencia.promocao_ativa 
      ? (planoReferencia.preco_promocional ?? planoReferencia.preco)
      : planoReferencia.preco
  );

  const valorUnitario = precoRef / franquiaRef;
  const precoCalculado = quantidade * valorUnitario;

  return {
    precoCalculado: Math.round(precoCalculado * 100) / 100,
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
 * Helper: Calcula valor pro-rata baseado na data de vencimento (vigencia_fim)
 * @param valorMensal - Valor mensal integral a ser considerado (ou diferença mensal)
 * @param dataVencimento - Data de fim da vigência atual
 * @param options - Opções extras (valorMinimo, diasBase)
 * @returns Objeto com valorCobrar e diasRestantes
 */
function calcularValorProRata(
  valorMensal: number, 
  dataVencimento?: string,
  options?: { valorMinimo?: number, diasBase?: number }
): { valorCobrar: number, diasRestantes: number } {
  const diasBase = options?.diasBase || 30;
  const valorMinimo = options?.valorMinimo ?? 0.01;

  if (!dataVencimento || valorMensal <= 0) {
    // Se valorMensal for 0 mas houver um mínimo configurado (para expansão), retornar o mínimo se for exigido externamente
    // Mas aqui é apenas cálculo matemático. A imposição do mínimo ocorre baseada na lógica de negócio.
    // Retornamos 0 aqui se valorMensal for 0.
    return { valorCobrar: valorMensal > 0 ? valorMensal : 0, diasRestantes: diasBase };
  }

  const hoje = new Date();
  const vencimento = new Date(dataVencimento);
  
  // Diferença em milissegundos
  const diffTime = vencimento.getTime() - hoje.getTime();
  
  // Converter para dias (arredondando para cima para cobrar o dia atual se houver fração)
  let diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  // Limites: mín 1 dia, máx diasBase
  if (diasRestantes < 0) diasRestantes = 0;
  if (diasRestantes > diasBase) diasRestantes = diasBase;

  // Calculo Pro-rata: (Valor / diasBase) * Dias
  const valorProRata = (valorMensal / diasBase) * diasRestantes;
  
  // Arredondar para 2 casas decimais
  let valorCobrar = Math.round(valorProRata * 100) / 100;

  // GARANTIA: Se valorMensal > 0 e deu centavos, cobrar mínimo
  if (valorMensal > 0 && valorCobrar < valorMinimo) {
    valorCobrar = valorMinimo;
  }

  return { valorCobrar, diasRestantes };
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
    // Buscar assinatura ativa ou falhar graciosamente
    let assinaturaAtual: any = null;
    try {
      assinaturaAtual = await getAssinaturaAtiva(usuarioId);
    } catch (e) {
      // Se não tem assinatura ativa, assumir status de "Plano Gratuito" / "Sem Plano"
      // Isso permite que usuários sem plano ou com plano cancelado façam "upgrade" (reativação/nova compra)
      logger.info({ usuarioId }, "Upgrade iniciado sem assinatura ativa: assumindo origem Gratuito/Inativo.");
    }

    const planoAtual = assinaturaAtual?.planos; // Pode ser undefined
    
    // Buscar novo plano com parent para identificar slug base
    const { data: novoPlano, error: planoError } = await supabaseAdmin
      .from("planos")
      .select("id, slug, nome, preco, preco_promocional, promocao_ativa, franquia_cobrancas_mes, parent:parent_id(slug)")
      .eq("id", novoPlanoId)
      .single();

    if (planoError || !novoPlano) {
      throw new Error("Plano selecionado não encontrado.");
    }

    // Se o plano atual é um subplano (tem parent), usar o slug do parent para comparação
    // Se não tem plano atual, usar PLANO_GRATUITO como base
    const slugAtual = planoAtual 
      ? ((planoAtual.parent as any)?.slug || planoAtual.slug) 
      : PLANO_GRATUITO;

    // Se o NOVO plano é um subplano (tem parent), usar o slug do parent para comparação
    const slugNovo = (novoPlano.parent as any)?.slug || novoPlano.slug;

    // Validar que é upgrade (hierarquia de planos)
    if (!isUpgrade(slugAtual, slugNovo)) {
      throw new Error("Esta operação não é um upgrade. Use o endpoint de downgrade.");
    }

    // Limpar assinaturas pendentes antigas (garante que só há uma pendente por vez)
    await limparAssinaturasPendentes(usuarioId);

    // Calcular preços e franquia do novo plano
    const { precoAplicado, precoOrigem, franquiaContratada } = calcularPrecosEFranquia(novoPlano);

    // Se tinha assinatura, tentar manter a data base (anchor_date)
    // Se não tinha (ou estava inativa/gratuito), a data base é hoje (início de novo ciclo)
    const hoje = new Date();
    const anchorDate = assinaturaAtual?.anchor_date || hoje.toISOString().split("T")[0];

    // Lógica de Trial (Gratuito -> Essencial)
    // Conforme solicitado: 7 dias grátis, sem verificação de histórico anterior
    // CORREÇÃO: Permitir também se slugAtual for ESSENCIAL (ex: tentativa anterior falhou/pendente)
    // Desde que não seja um downgrade do Profissional
    if (slugNovo === PLANO_ESSENCIAL && slugAtual !== PLANO_PROFISSIONAL) {
        const trialDays = 7;
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + trialDays);
        
        // CORREÇÃO: Desativar assinatura atual antes de ativar a nova (Trial)
        // O banco impede duas assinaturas ativas simultâneas (constraint unique)
        if (assinaturaAtual) {
            await supabaseAdmin
              .from("assinaturas_usuarios")
              .update({ ativo: false })
              .eq("id", assinaturaAtual.id);
        }

        // Criar assinatura JÁ ATIVA em modo Trial
        const { data: novaAssinatura, error: assinaturaError } = await supabaseAdmin
          .from("assinaturas_usuarios")
          .insert({
            usuario_id: usuarioId,
            plano_id: novoPlano.id,
            franquia_contratada_cobrancas: franquiaContratada,
            ativo: true, // Ativa imediatamente
            status: ASSINATURA_USUARIO_STATUS_TRIAL, // Status trial para consistência com cadastro
            billing_mode: "manual",
            preco_aplicado: precoAplicado,
            preco_origem: precoOrigem,
            anchor_date: anchorDate,
            vigencia_fim: null, // Ciclo de pagamento só começa após o primeiro pagamento
            trial_end_at: trialEnd.toISOString() // Marca o fim do trial
          })
          .select()
          .single();

        if (assinaturaError) throw assinaturaError;

        logger.info({ usuarioId, plano: novoPlano.slug }, "Upgrade com Trial de 7 dias ativado com sucesso.");

        // Criar cobrança pendente para o final do trial (igual ao registro)
        const { data: cobranca, error: cobrancaError } = await supabaseAdmin
          .from("assinaturas_cobrancas")
          .insert({
            usuario_id: usuarioId,
            assinatura_usuario_id: novaAssinatura.id,
            valor: precoAplicado,
            status: ASSINATURA_COBRANCA_STATUS_PENDENTE_PAGAMENTO,
            data_vencimento: trialEnd.toISOString().split("T")[0],
            origem: "inter",
            billing_type: "upgrade_plan",
            descricao: `Upgrade de Plano: ${planoAtual?.slug === PLANO_ESSENCIAL ? "Essencial" : "Grátis"} → ${novoPlano.nome} (Período de Testes)`,
          })
          .select()
          .single();

        if (cobrancaError) {
             logger.error({ error: cobrancaError, usuarioId }, "Erro ao criar cobrança para trial no upgrade");
             // Não falhar o upgrade, mas logar erro crítico
        }

        return {
            success: true,
            tipo: "upgrade",
            franquia: franquiaContratada,
            planoId: novoPlano.id,
            precoAplicado,
            precoOrigem,
            cobrancaId: cobranca?.id
        };
    }
    
    // ... Lógica padrão (Cobrança imediata) para outros casos ...
    
    // Determinar Estratégia de Cobrança (Pro-Rata vs Novo Ciclo)
    let billingType = "activation"; // Default: Novo Ciclo
    let valorCobrar = precoAplicado;
    let vigenciaFimInsert: string | null = null;
    let descricaoCobranca = `Upgrade de Plano: ${planoAtual?.slug === PLANO_ESSENCIAL ? "Essencial" : "Grátis"} → ${novoPlano.nome}`;

    if (assinaturaAtual && assinaturaAtual.vigencia_fim) {
        // Se tem assinatura ativa com vigência definida -> Pro-Rata
        const billingConfig = await getBillingConfig();
        const precoAtual = Number(assinaturaAtual.preco_aplicado || 0);
        const diferencaMensal = precoAplicado - precoAtual;

        // Calcular Pro-Rata
        const { valorCobrar: valorPR, diasRestantes } = calcularValorProRata(
            diferencaMensal,
            assinaturaAtual.vigencia_fim,
            { valorMinimo: billingConfig.valorMinimoProRata, diasBase: billingConfig.diasProRata }
        );

        valorCobrar = valorPR;
        billingType = "upgrade_plan"; // Sinaliza para o processador manter o ciclo
        vigenciaFimInsert = assinaturaAtual.vigencia_fim;
        descricaoCobranca += ` (Pro-Rata: ${diasRestantes} dias)`;

        logger.info({ 
            usuarioId, 
            valorCobrar, 
            diasRestantes, 
            vigenciaFim: vigenciaFimInsert 
        }, "Upgrade Pro-Rata calculado com sucesso.");
    } else {
        // Se não tem assinatura ativa (Inativo/Cancelado) -> Ativação (Novo Ciclo Completo)
        billingType = "activation";
        valorCobrar = precoAplicado;
        vigenciaFimInsert = null; // Será calculado no pagamento (Data Pagamento + 1 Mês)
        
        logger.info({ usuarioId, valorCobrar }, "Upgrade sem assinatura ativa: Iniciando como Ativação (Novo Ciclo).");
    }

    // Criar nova assinatura (inativa até pagamento)
    const { data: novaAssinatura, error: assinaturaError } = await supabaseAdmin
      .from("assinaturas_usuarios")
      .insert({
        usuario_id: usuarioId,
        plano_id: novoPlano.id,
        franquia_contratada_cobrancas: franquiaContratada,
        ativo: false,
        status: ASSINATURA_USUARIO_STATUS_PENDENTE_PAGAMENTO,
        billing_mode: novoPlano.slug === PLANO_PROFISSIONAL ? "automatico" : "manual",
        preco_aplicado: precoAplicado, // Preço base do plano (para renovações futuras)
        preco_origem: precoOrigem,
        anchor_date: anchorDate,
        vigencia_fim: vigenciaFimInsert,
      })
      .select()
      .single();

    if (assinaturaError) throw assinaturaError;

    const { data: cobranca, error: cobrancaError } = await supabaseAdmin
      .from("assinaturas_cobrancas")
      .insert({
        usuario_id: usuarioId,
        assinatura_usuario_id: novaAssinatura.id,
        valor: valorCobrar,
        status: ASSINATURA_COBRANCA_STATUS_PENDENTE_PAGAMENTO,
        data_vencimento: hoje.toISOString().split("T")[0],
        origem: "inter",
        billing_type: billingType,
        descricao: descricaoCobranca,
      })
      .select()
      .single();

    if (cobrancaError) throw cobrancaError;

    // Se não precisa seleção manual OU se for Profissional (sempre gera PIX), gerar PIX normalmente
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


    // Envio Imediato do PIX via WhatsApp (Garantia de Entrega)
    try {
        if (usuario.telefone) {
            const eventType = billingType === "activation" ? DRIVER_EVENT_ACTIVATION : DRIVER_EVENT_UPGRADE;
            
            notificationService.notifyDriver(usuario.telefone, eventType, {
                nomeMotorista: usuario.nome,
                nomePlano: novoPlano.nome,
                valor: precoAplicado,
                dataVencimento: hoje.toISOString().split("T")[0],
                pixPayload: pixData.qrCodePayload
            }).catch(err => logger.error({ err }, "Falha ao enviar PIX imediato no upgrade"));
        }
    } catch (notifErr) {
        logger.error({ notifErr }, "Erro no bloco de notificação imediata");
    }

    // Não ativar passageiros aqui - será feito no webhook após confirmação do pagamento
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

    // Buscar novo plano (incluir franquia_cobrancas_mes para planos Profissional)
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
        billing_mode: novoPlano.slug === PLANO_PROFISSIONAL ? "automatico" : "manual",
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

    // CORREÇÃO DOWNGRADE GAP (Free Lunch Fix):
    // 1. Antes: Cancelava a antiga e criava a nova SEM cobrar.
    // 2. Agora: Gera cobrança imediata do novo plano para garantir continuidade.
    // Se for plano GRATUITO, não gera cobrança.
    let cobrancaNovaId = null;
    let qrCodePayload = null;
    let location = null;
    let inter_txid = null;

    if (novoPlano.slug !== PLANO_GRATUITO && precoAplicado > 0) {
        // CORREÇÃO DATA VENCIMENTO:
        // Usar a vigência fim (início do novo ciclo) ou HOJE se já expirado.
        const hojeDate = new Date();
        const vigenciaFimDate = assinaturaAtual.vigencia_fim ? new Date(assinaturaAtual.vigencia_fim) : hojeDate;
        
        // Se a vigência fim for no futuro, usa ela. Senão (vencida), usa hoje.
        const cobrancaDate = vigenciaFimDate > hojeDate ? vigenciaFimDate : hojeDate;
        const dataVencimentoCobranca = cobrancaDate.toISOString().split("T")[0];

        // Criar Cobrança Pendente
        const { data: cobrancaNova, error: cobrancaError } = await supabaseAdmin
            .from("assinaturas_cobrancas")
            .insert({
                usuario_id: usuarioId,
                assinatura_usuario_id: novaAssinatura.id,
                valor: precoAplicado,
                status: ASSINATURA_COBRANCA_STATUS_PENDENTE_PAGAMENTO,
                data_vencimento: dataVencimentoCobranca,
                origem: "inter",
                billing_type: "downgrade",
                descricao: `Downgrade de Plano - ${novoPlano.nome}`,
            })
            .select()
            .single();

        if (cobrancaError) throw cobrancaError;
        cobrancaNovaId = cobrancaNova.id;

        // Gerar PIX na hora
         try {
             // Buscar dados do usuário para o PIX
             const { data: userPix } = await supabaseAdmin
                .from("usuarios")
                .select("nome, cpfcnpj")
                .eq("id", usuarioId)
                .single();

             if (userPix) {
                 const pixData = await interService.criarCobrancaPix(supabaseAdmin, {
                    cobrancaId: cobrancaNova.id,
                    valor: precoAplicado,
                    cpf: onlyDigits(userPix.cpfcnpj),
                    nome: userPix.nome,
                 });

                 await supabaseAdmin
                    .from("assinaturas_cobrancas")
                    .update({
                        inter_txid: pixData.interTransactionId,
                        qr_code_payload: pixData.qrCodePayload,
                        location_url: pixData.location,
                    })
                    .eq("id", cobrancaNova.id);

                  qrCodePayload = pixData.qrCodePayload;
                  location = pixData.location;
                  inter_txid = pixData.interTransactionId;
                  logger.info({ cobrancaId: cobrancaNova.id }, "Cobrança de Downgrade gerada com sucesso.");
             }
         } catch (pixErr: any) {
             logger.error({ err: pixErr.message }, "Erro ao gerar PIX no Downgrade (cobrança criada, PIX falhou)");
         }
    }

    // Desativar automação de passageiros (Regra de Negócio: Downgrade remove automação)
    if (slugAtual === PLANO_PROFISSIONAL || (planoAtual.parent as any)?.slug === PLANO_PROFISSIONAL) {
        try {
            const desativados = await passageiroService.desativarAutomacaoTodosPassageiros(usuarioId);
            logger.info({ usuarioId, desativados }, "Automação de passageiros desativada devido ao downgrade");
        } catch (autoError: any) {
            logger.error({ usuarioId, error: autoError.message }, "Erro ao desativar automação de passageiros no downgrade (inconsistência possível)");
            // Não falhar o downgrade por isso, mas logar erro crítico
        }
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
 * Troca de subplano (dentro do mesmo plano Profissional)
 * - Se maior: gera cobrança da diferença
 * - Se menor: não gera cobrança (próxima fatura virá com valor reduzido)
 * - Cancela cobrança pendente se existir
 * - Mantém vigência original
 * - Se o usuário não estiver no Profissional, faz upgrade para o Profissional com o subplano escolhido
 */
export async function trocarSubplano(
  usuarioId: string,
  novoSubplanoId: string
): Promise<TrocaSubplanoResult> {
  try {
    // Buscar assinatura ativa
    const assinaturaAtual = await getAssinaturaAtiva(usuarioId);
    const planoAtual = assinaturaAtual.planos as any;

    // Verificar se está no plano Profissional (pode ser o plano base ou um subplano)
    const isProfissionalBase = planoAtual.slug === PLANO_PROFISSIONAL;
    const isProfissionalSub = !!planoAtual.parent_id;
    const estaNoProfissional = isProfissionalBase || isProfissionalSub;

    // Buscar novo subplano
    const { data: novoSubplano, error: planoError } = await supabaseAdmin
      .from("planos")
      .select("id, slug, nome, preco, preco_promocional, promocao_ativa, franquia_cobrancas_mes, parent_id")
      .eq("id", novoSubplanoId)
      .single();

    if (planoError || !novoSubplano) {
      throw new Error("Subplano selecionado não encontrado.");
    }

    // Validar que é subplano do Profissional
    // Buscar o plano base Profissional
    const { data: planoProfissionalBase, error: planoBaseError } = await supabaseAdmin
      .from("planos")
      .select("id")
      .eq("slug", PLANO_PROFISSIONAL)
      .eq("tipo", "base")
      .single();

    if (planoBaseError || !planoProfissionalBase) {
      throw new Error("Plano Profissional não encontrado.");
    }

    // Validar que o novo subplano pertence ao plano Profissional
    if (novoSubplano.parent_id !== planoProfissionalBase.id) {
      throw new Error("Subplano inválido. Deve pertencer ao plano Profissional.");
    }

    // Se o usuário não está no Profissional, fazer upgrade para o Profissional com o subplano escolhido
    if (!estaNoProfissional) {
      // Fazer upgrade para o Profissional com o subplano escolhido
      // Limpar assinaturas pendentes antigas
      await limparAssinaturasPendentes(usuarioId);
      await cancelarCobrancaPendente(usuarioId); // Garantia extra contra boletos de renovação antigos

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
          billing_type: "upgrade_plan",
        descricao: `Upgrade de Plano: ${planoAtual.nome} → ${novoSubplano.nome}`,
        })
        .select()
        .single();

      if (cobrancaError) throw cobrancaError;

      // Validar que a nova franquia é MAIOR ou IGUAL a atual (Regra de Negócio: Não permite downgrade de franquia)
      // Exception: Se franquia for igual (ex: troca de ciclo ou ajuste de preço), permitimos? Assumimos que trocarSubplano é para mudar franquia.
      // Se nova < atual => Erro.
      const franquiaAtual = assinaturaAtual.franquia_contratada_cobrancas || 0;
      if (franquiaContratada < franquiaAtual) {
         throw new Error("Não é permitido reduzir a franquia do plano Profissional. Entre em contato com o suporte.");
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
      };
    }

    // Calcular preços e franquia do novo subplano (uma única vez)
    const { precoAplicado, precoOrigem, franquiaContratada } = calcularPrecosEFranquia(novoSubplano);

    // Buscar configs de billing
    const billingConfig = await getBillingConfig();

    // Calcular diferença (usuário já está no Profissional) usando Pro-rata
    const precoAtual = Number(assinaturaAtual.preco_aplicado || 0);
    const diferencaMensal = precoAplicado - precoAtual;
    const franquiaAtual = assinaturaAtual.franquia_contratada_cobrancas || 0;
    
    // CORREÇÃO: Upgrade considera AUMENTO DE FRANQUIA, mesmo que preço seja igual (diferencaMensal == 0)
    // Se diff < 0 é downgrade. Se diff > 0 é upgrade. Se diff == 0, desempata pela franquia.
    const isDowngrade = diferencaMensal < 0 || (diferencaMensal === 0 && franquiaContratada <= franquiaAtual);

    // Calcular valor a cobrar (Pro-rata)
    let { valorCobrar: diferenca, diasRestantes } = calcularValorProRata(
      diferencaMensal,
      assinaturaAtual.vigencia_fim,
      { valorMinimo: billingConfig.valorMinimoProRata, diasBase: billingConfig.diasProRata }
    );
    
    // CORREÇÃO CRÍTICA: Se for Upgrade de Franquia com Diferença Zero (teste ou brinde), cobrar MÍNIMO SIMBÓLICO
    // para garantir geração de fluxo de PIX.
    if (!isDowngrade && diferenca < billingConfig.valorMinimoProRata) {
        diferenca = billingConfig.valorMinimoProRata;
    }


    // Se for downgrade, verificar ANTES de fazer qualquer alteração se precisa seleção manual
    // Se for downgrade (franquia menor), disparar ERRO
    if (franquiaContratada < franquiaAtual) {
       throw new Error("Não é permitido reduzir a franquia do plano Profissional. Entre em contato com o suporte.");
    }

    // Manter vigência original (incluindo vigencia_fim)
    const anchorDate = assinaturaAtual.anchor_date || new Date().toISOString().split("T")[0];
    const vigenciaFim = assinaturaAtual.vigencia_fim || null;

    // Se for upgrade (diferença > 0), criar assinatura e cobrança
    if (diferenca > 0) {
      await limparAssinaturasPendentes(usuarioId);
      await cancelarCobrancaPendente(usuarioId); // Garantia extra contra boletos de renovação antigos
      
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
          billing_type: "expansion",
          descricao: `Expansão de Limite: ${assinaturaAtual.franquia_contratada_cobrancas} → ${franquiaContratada} passageiros`,
        })
        .select()
        .single();

      if (cobrancaError) throw cobrancaError;


      // PARA UPGRADES: Geramos o PIX SEMPRE.
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

      };
    }
  } catch (err: any) {
    logger.error({ error: err.message, usuarioId, novoSubplanoId }, "Falha na troca de subplano.");
    throw new Error(err.message || "Erro desconhecido ao trocar subplano.");
  }
}

/**
 * Cria ou atualiza assinatura do plano Profissional com quantidade personalizada de cobranças
 * - Se for redução (downgrade): atualiza assinatura atual sem gerar cobrança
 * - Se for aumento (upgrade) ou novo usuário: gera cobrança PIX
 * - Mantém vigência original se houver assinatura atual
 */
export async function criarAssinaturaProfissionalPersonalizado(
  usuarioId: string,
  quantidade: number,
  targetPassengerId?: string
): Promise<CriarAssinaturaPersonalizadaResult> {
  try {
    // Calcular preço (já valida quantidade mínima internamente)
    // Passamos ignorarMinimo=true para permitir upgrades flexíveis (ex: 15 passageiros)
    const { precoCalculado } = await calcularPrecoPersonalizado(quantidade, true);

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

    // Buscar o plano base Profissional
    const { data: planoProfissionalBase, error: planoBaseError } = await supabaseAdmin
      .from("planos")
      .select("id")
      .eq("slug", PLANO_PROFISSIONAL)
      .eq("tipo", "base")
      .single();

    if (planoBaseError || !planoProfissionalBase) {
      throw new Error("Plano Profissional não encontrado.");
    }

    // Regra de negócio: não permitir downgrade
    if (isDowngrade && assinaturaAtual) {
      throw new Error("Não é permitido reduzir a franquia do plano Profissional. Entre em contato com o suporte.");
    }

    // Se for upgrade ou novo usuário, criar assinatura e cobrança primeiro
    // Limpar assinaturas pendentes antigas (garante que só há uma pendente por vez)
    await limparAssinaturasPendentes(usuarioId);
    await cancelarCobrancaPendente(usuarioId); // Garantia extra contra boletos de renovação antigos

    // Manter vigência original se houver assinatura atual
    const anchorDate = assinaturaAtual?.anchor_date || new Date().toISOString().split("T")[0];
    const vigenciaFim = assinaturaAtual?.vigencia_fim || null;

    // Criar nova assinatura (inativa até pagamento)
    // Usar o plano Profissional base como plano_id, mas com franquia_contratada_cobrancas personalizada
    const { data: novaAssinatura, error: assinaturaError } = await supabaseAdmin
      .from("assinaturas_usuarios")
      .insert({
        usuario_id: usuarioId,
        plano_id: planoProfissionalBase.id, // Plano Profissional base
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
    
    // Se for upgrade, calcular pro-rata
    let valorCobranca = precoCalculado;
    if (assinaturaAtual) {
      const precoAtual = Number(assinaturaAtual.preco_aplicado || 0);

      // CORREÇÃO: Se o plano atual for Gratuito (0.00) ou Trial, tratar como novo ciclo (cobrança cheia)
      if (precoAtual <= 0) {
        valorCobranca = precoCalculado;
      } else {
        // Buscar configs
        const config = await getBillingConfig();
        const diferencaMensal = precoCalculado - precoAtual;
        const { valorCobrar } = calcularValorProRata(
          diferencaMensal, 
          assinaturaAtual.vigencia_fim,
          { valorMinimo: config.valorMinimoProRata, diasBase: config.diasProRata }
        );
        valorCobranca = valorCobrar;
        
        // Aplica mínimo se for expansão positiva
        if (diferencaMensal >= 0 && valorCobranca < config.valorMinimoProRata) {
            valorCobranca = config.valorMinimoProRata;
        }
      }
    }

    const hoje = new Date();
    const { data: cobranca, error: cobrancaError } = await supabaseAdmin
      .from("assinaturas_cobrancas")
      .insert({
        usuario_id: usuarioId,
        assinatura_usuario_id: novaAssinatura.id,
        valor: valorCobranca,
        status: ASSINATURA_COBRANCA_STATUS_PENDENTE_PAGAMENTO,
        data_vencimento: hoje.toISOString().split("T")[0],
        origem: "inter",
        billing_type: billingType === "subscription" ? "activation" : "expansion",
        descricao: billingType === "subscription" 
          ? `Ativação de Plano Profissional (${quantidade} passageiros)`
          : `Expansão de Limite: ${assinaturaAtual.franquia_contratada_cobrancas} → ${quantidade} passageiros`,
        selecao_passageiros_pendente: targetPassengerId 
          ? { passageiroIds: [targetPassengerId], tipo: billingType, franquia: quantidade }
          : null,
      })
      .select()
      .single();

    if (cobrancaError) throw cobrancaError;


    // Gerar PIX normalmente
    const usuario = await getUsuarioData(usuarioId);
    const cpf = onlyDigits(usuario.cpfcnpj);

    const pixData = await interService.criarCobrancaPix(supabaseAdmin, {
      cobrancaId: cobranca.id,
      valor: valorCobranca,
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
    };

  } catch (err: any) {
    logger.error({ error: err.message, usuarioId, quantidade }, "Falha ao criar assinatura personalizada.");
    throw new Error(err.message || "Erro desconhecido ao criar assinatura personalizada.");
  }
}




// -- Atualização Cadastral --
export async function atualizarUsuario(usuarioId: string, payload: { 
    nome?: string; 
    apelido?: string; 
    telefone?: string; 
    chave_pix?: string; 
    tipo_chave_pix?: string; 
}) {
    if (!usuarioId) throw new Error("ID do usuário é obrigatório.");

    const updates: any = { updated_at: new Date().toISOString() };
    if (payload.nome) updates.nome = cleanString(payload.nome, true);
    if (payload.apelido) updates.apelido = cleanString(payload.apelido, true);
    if (payload.telefone) updates.telefone = onlyDigits(payload.telefone);
    
    // Atualização de PIX com Sanitização Obrigatória e TRIGGER DE VALIDAÇÃO
    if (payload.chave_pix !== undefined) {
        // Validação estrita do ENUM
        if (payload.tipo_chave_pix && !TIPOS_CHAVE_PIX_VALIDOS.includes(payload.tipo_chave_pix as any)) {
             throw new Error("Tipo de chave PIX inválido.");
        }

        const tipoConsiderado = payload.tipo_chave_pix || undefined; // Se não enviado, assume que o usuário mantém o tipo (mas idealmente deve enviar junto)
        // OBS: Se o usuário mudar a chave, o frontend DEVE enviar o tipo.
        
        let chaveSanitizada = "";
        
        // Se temos o tipo e é um dos numéricos, remover formatação
        if (tipoConsiderado && [TipoChavePix.CPF, TipoChavePix.CNPJ, TipoChavePix.TELEFONE].includes(tipoConsiderado as any)) {
            chaveSanitizada = onlyDigits(payload.chave_pix);
        } else {
            // Para E-mail, Aleatória ou se não temos o tipo (fallback), apenas limpar espaços
            chaveSanitizada = cleanString(payload.chave_pix);
        }

        updates.chave_pix = chaveSanitizada;
        if (payload.tipo_chave_pix) updates.tipo_chave_pix = payload.tipo_chave_pix;
        
        // RESETAR STATUS E INICIAR VALIDAÇÃO
        updates.status_chave_pix = "PENDENTE_VALIDACAO";
        updates.chave_pix_validada_em = null;
        updates.nome_titular_pix_validado = null;
        updates.cpf_cnpj_titular_pix_validado = null;
    } else {
        // Se não está atualizando chave pix, mas está atualizando outros dados...
        // Nada a fazer com PIX.
    }

    const { error } = await supabaseAdmin
        .from("usuarios")
        .update(updates)
        .eq("id", usuarioId);

    if (error) {
        throw new Error(`Erro ao atualizar usuário: ${error.message}`);
    }

    // TRIGGER ASYNC VALIDATION (Se houve alteração de PIX)
    if (payload.chave_pix !== undefined) {
        // Disparar validação em background
        // O valor já foi sanitizado e salvo em `updates.chave_pix`
        iniciarValidacaoPix(usuarioId, updates.chave_pix)
            .catch(err => {
                logger.error({ error: err.message, usuarioId }, "Falha silenciosa ao iniciar validação PIX (background) após update.");
            });
    }

    return { success: true };
}

// -- Validação de Chave PIX (Micro-pagamento) --

/**
 * Cadastra ou atualiza chave PIX e inicia processo de validação
 */
export async function cadastrarOuAtualizarChavePix(
  usuarioId: string, 
  chavePix: string, 
  tipoChave: string
) {
  if (!usuarioId) throw new Error("ID do usuário é obrigatório.");
  if (!chavePix) throw new Error("Chave PIX é obrigatória.");

  // 1. Sanitizar
  let chaveSanitizada = chavePix.trim();
  if ([TipoChavePix.CPF, TipoChavePix.CNPJ, TipoChavePix.TELEFONE].includes(tipoChave as any)) {
      chaveSanitizada = onlyDigits(chavePix);
  }

  // 2. Salvar no Banco como PENDENTE
  const { error } = await supabaseAdmin
      .from("usuarios")
      .update({
          chave_pix: chaveSanitizada,
          tipo_chave_pix: tipoChave,
          status_chave_pix: "PENDENTE_VALIDACAO",
          chave_pix_validada_em: null, // Reseta validação anterior
          nome_titular_pix_validado: null,
          cpf_cnpj_titular_pix_validado: null,
          updated_at: new Date().toISOString()
      })
      .eq("id", usuarioId);

  if (error) {
      logger.error({ error: error.message, usuarioId }, "Erro ao salvar chave PIX pendente.");
      throw new Error("Erro ao salvar chave PIX.");
  }

  // 3. Iniciar Validação Async (Micro-pagamento)
  // Não aguardamos o resultado para não travar a UI (o webhook confirmará)
  // Mas chamamos a função para garantir que o request saia
  iniciarValidacaoPix(usuarioId, chaveSanitizada)
      .catch(err => {
          logger.error({ error: err.message, usuarioId }, "Falha silenciosa ao iniciar validação PIX (background).");
      });

  return { success: true, status: "PENDENTE_VALIDACAO" };
}

/**
 * Realiza a validação ativa (envia R$ 0,01)
 */
async function iniciarValidacaoPix(usuarioId: string, chavePix: string) {
  const xIdIdempotente = randomUUID();

  try {
      // 1. Registrar intenção de validação (Tabela Temporária)
      const { error: insertError } = await supabaseAdmin
          .from("pix_validacao_pendente")
          .insert({
              usuario_id: usuarioId,
              x_id_idempotente: xIdIdempotente,
              chave_pix_enviada: chavePix
          });

      if (insertError) {
          throw new Error(`Erro ao criar registro de validação pendente: ${insertError.message}`);
      }

      // 2. Realizar Micro-Pagamento (R$ 0,01)
      await interService.realizarPagamentoPix(supabaseAdmin, {
          valor: 0.01,
          chaveDestino: chavePix,
          descricao: `Validacao Van360 ${usuarioId.substring(0, 8)}`,
          xIdIdempotente
      });

      logger.info({ usuarioId, xIdIdempotente }, "Micro-pagamento de validação PIX enviado com sucesso.");

      // BLOCK MOCK: Auto-validar se estiver em ambiente de teste
      if (env.INTER_MOCK_MODE === "true" || (env.INTER_MOCK_MODE as any) === true) {
          logger.warn({ usuarioId }, "MOCK MODE: Auto-validando chave PIX em 3 segundos...");
          
          setTimeout(async () => {
              try {
                  await supabaseAdmin.from("usuarios").update({
                      status_chave_pix: "VALIDADA",
                      chave_pix_validada_em: new Date().toISOString(),
                      nome_titular_pix_validado: "MOCK USER AUTO",
                      cpf_cnpj_titular_pix_validado: chavePix
                  }).eq("id", usuarioId);

                  await supabaseAdmin.from("pix_validacao_pendente")
                      .delete()
                      .eq("x_id_idempotente", xIdIdempotente);
                      
                  logger.info({ usuarioId }, "MOCK MODE: Chave PIX auto-validada com sucesso.");
              } catch (mockErr) {
                  logger.error({ mockErr }, "Erro ao auto-validar em MOCK MODE");
              }
          }, 3000);
      }

  } catch (err: any) {
      // Falha Imediata (ex: chave inválida na hora do envio)
      logger.error({ error: err.message, usuarioId }, "Falha ao iniciar validação PIX.");

  }
}

/**
 * Processa o retorno (Webhook) da validação PIX
 */
export async function processarRetornoValidacaoPix(
  identificador: { e2eId?: string, txid?: string }
) {
  logger.info({ identificador }, "Processando retorno de validação PIX...");

  // 1. Buscar na tabela temporária
  let query = supabaseAdmin
      .from("pix_validacao_pendente")
      .select("id, usuario_id, x_id_idempotente, chave_pix_enviada, created_at");

  // Tenta pelo ID de idempotência (se foi salvo como txid no envio? não, enviamos xIdIdempotente)
  // O webhook de pagamento do Inter retorna o endToEndId. 
  // O xIdIdempotente é nosso controle.
  // Precisamos vincular o endToEndId ao xIdIdempotente... 
  // PROBLEMA: O webhook de *pagamento* (saída) manda o endToEndId. 
  // O endpoint de *iniciação* (pagamento) retorna o endToEndId IMEDIATAMENTE.
  // Deveríamos ter salvo o endToEndId na tabela `pix_validacao_pendente` no momento do envio.
  // CORREÇÃO: Vamos ajustar `iniciarValidacaoPix` para salvar o `endToEndId`.
  
  // Por enquanto, assumindo que buscaremos pelo endToEndId salvo (que vou adicionar na tabela).
  // Se não tivermos o endToEndId (ex: falha no update previo), teremos problemas.
  
  // Assumindo que o identificador recebido é o endToEndId
  if (identificador.e2eId) {
      query = query.eq("end_to_end_id", identificador.e2eId);
  } else {
      logger.warn("Identificador inválido para validação PIX (sem e2eId).");
      return { success: false, reason: "sem_id" };
  }

  const { data: pendentes, error } = await query;
  
  if (error || !pendentes || pendentes.length === 0) {
      logger.warn({ identificador }, "Nenhuma validação pendente encontrada para este retorno.");
      return { success: false, reason: "nao_encontrado" };
  }

  const pendente = pendentes[0];
  const usuarioId = pendente.usuario_id;
  const e2eId = identificador.e2eId;

  // 2. Consultar Detalhes no Inter (Quem recebeu?)
  // Endpoint GET /pix/v2/pix/{e2eId} retorna dados da transação
  // Precisamos de uma nova função no inter.service para isso
  let dadosPix: any;
  try {
      dadosPix = await interService.consultarPix(supabaseAdmin, e2eId!);
  } catch (err) {
      logger.error({ err, e2eId }, "Erro ao consultar dados do PIX no Inter.");
      return { success: false, reason: "erro_consulta_inter" };
  }

  // 3. Validar Titularidade
  // O retorno do Inter deve ter algo como "chave", "pagador" (quem enviou - nós), "recebedor" (o motorista)
  // Estrutura típica V2: { endToEndId, valor, horario, recebedor: { nome, cpfCnpj, ... } }
  
  const nomeRecebedor = dadosPix.recebedor?.nome;
  const cpfCnpjRecebedor = dadosPix.recebedor?.cpfCnpj || dadosPix.recebedor?.cpf || dadosPix.recebedor?.cnpj;

  if (!nomeRecebedor || !cpfCnpjRecebedor) {
      logger.error({ dadosPix }, "Dados do recebedor incompletos no retorno do Inter.");
      // Marcar falha
      await supabaseAdmin.from("usuarios").update({ status_chave_pix: "FALHA_VALIDACAO" }).eq("id", usuarioId);
      return { success: false, reason: "dados_incompletos" };
  }

  // Buscar dados do Motorista
  const usuario = await getUsuarioData(usuarioId);
  const cpfMotorista = onlyDigits(usuario.cpfcnpj);
  const cpfRecebedor = onlyDigits(cpfCnpjRecebedor);

  // Comparação
  const cpfMatch = cpfMotorista === cpfRecebedor;
  
  // Nome (Similaridade simplificada)
  const nomeMotoristaClean = cleanString(usuario.nome, true).toUpperCase().split(" ")[0]; // Primeiro nome
  const nomeRecebedorClean = cleanString(nomeRecebedor, true).toUpperCase();
  const nomeMatch = nomeRecebedorClean.includes(nomeMotoristaClean); // Contém o primeiro nome?

  if (cpfMatch) {
      // SUCESSO!
      await supabaseAdmin.from("usuarios").update({
          status_chave_pix: "VALIDADA",
          chave_pix_validada_em: new Date().toISOString(),
          nome_titular_pix_validado: nomeRecebedor,
          cpf_cnpj_titular_pix_validado: cpfCnpjRecebedor
      }).eq("id", usuarioId);
      
      // Limpar pendência
      await supabaseAdmin.from("pix_validacao_pendente").delete().eq("id", pendente.id);
      
      logger.info({ usuarioId, chave: pendente.chave_pix_enviada }, "Chave PIX Validada com Sucesso!");
      return { success: true, status: "VALIDADA" };

  } else {
      // FALHA DE TITULARIDADE
      logger.warn({ usuarioId, esperado: cpfMotorista, recebido: cpfRecebedor }, "Falha de titularidade na validação PIX.");
      
      await supabaseAdmin.from("usuarios").update({
          status_chave_pix: "FALHA_VALIDACAO"
      }).eq("id", usuarioId);

      // Limpar pendência mesmo com falha (para não tentar de novo erradamente)
      await supabaseAdmin.from("pix_validacao_pendente").delete().eq("id", pendente.id); // OU manter para debug? Melhor limpar.

      return { success: false, reason: "titularidade_invalida" };
  }
}
