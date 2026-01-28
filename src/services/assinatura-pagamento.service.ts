import {
  PLANO_PROFISSIONAL
} from "../config/constants.js";
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import {
  AssinaturaBillingType,
  AssinaturaCobrancaStatus,
  AssinaturaTipoPagamento
} from "../types/enums.js";
import { automationService } from "./automation.service.js";
import { cobrancaService } from "./cobranca.service.js";
import { paymentService } from "./payment.service.js";

interface DadosPagamento {
  valor: number;
  dataPagamento: string;
  txid?: string;
}

interface AssinaturaCobrancaInfo {
  id: string;
  usuario_id: string;
  assinatura_usuario_id: string;
  status: string;
  data_vencimento?: string;
  billing_type?: string;
  gateway_txid?: string;
  valor?: number;
  valor_pago?: number;
}

interface ContextoLog {
  txid?: string;
  cobrancaId?: string;
}

/**
 * Processa o pagamento de uma cobrança, ativando assinatura, usuário e passageiros quando aplicável.
 * Esta função centraliza toda a lógica de processamento de pagamento, sendo usada tanto pelo
 * webhook real quanto pelo mock de pagamento.
 */
export async function processarPagamentoAssinatura(
  cobranca: AssinaturaCobrancaInfo,
  dadosPagamento: DadosPagamento,
  contextoLog: ContextoLog = {},
  reciboUrl?: string
): Promise<{ vigenciaFim: Date; isOnboardingPayment?: boolean } | void> {
  const { txid, cobrancaId } = contextoLog;
  const logContext = txid ? { txid } : { cobrancaId };

  try {
    // 0. Calcular taxa de intermediação real do Gateway
    // Assinaturas do Van360 sempre usam PIX com Vencimento (COBV)
    const provider = paymentService.getProvider();
    const gatewayFee = await provider.getFee(dadosPagamento.valor || cobranca.valor_pago || 0, 'vencimento');

    // 1. Atualizar status da cobrança para pago e registrar taxa (COM VERIFICAÇÃO DE IDEMPOTÊNCIA)
    const { error: updateCobrancaError, data: updatedCobranca } = await supabaseAdmin
      .from("assinaturas_cobrancas")
      .update({
        status: AssinaturaCobrancaStatus.PAGO,
        data_pagamento: dadosPagamento.dataPagamento,
        valor_pago: dadosPagamento.valor,
        tipo_pagamento: AssinaturaTipoPagamento.PIX,
        gateway_fee: gatewayFee,
        dados_auditoria_pagamento: {
          ...dadosPagamento,
          ...contextoLog,
          data_processamento: new Date().toISOString()
        },
        recibo_url: reciboUrl || null
      })
      .eq("id", cobranca.id)
      .eq("status", AssinaturaCobrancaStatus.PENDENTE_PAGAMENTO)
      .select();

    const updateCount = updatedCobranca?.length || 0;

    if (updateCobrancaError) {
      logger.error({ ...logContext, updateCobrancaError }, "Erro ao atualizar cobrança");
      throw new Error("Erro ao atualizar cobrança");
    }

    if (updateCount === 0) {
      // Verificar se já foi paga (Idempotência)
      const { data: checkState } = await supabaseAdmin
        .from("assinaturas_cobrancas")
        .select("status")
        .eq("id", cobranca.id)
        .single();

      if (checkState?.status === AssinaturaCobrancaStatus.PAGO) {
        logger.info({ ...logContext }, "Idempotência: Cobrança já processada anteriormente. Ignorando.");
        return; // Retorno silencioso de sucesso
      }

      logger.warn({ ...logContext, statusEncontrado: checkState?.status }, "Cobrança não encontrada ou estado inválido para processamento");
      throw new Error("Nenhuma cobrança foi atualizada (possível estado inválido)");
    }

    logger.info({ ...logContext }, "Cobrança atualizada com sucesso");

    // 2. Calcular vigencia_fim e anchor_date
    const { vigenciaFim, novoAnchorDate, isOnboardingPayment } = await calcularVigenciaFimEAnchorDate(
      cobranca,
      dadosPagamento.dataPagamento,
      logContext
    );

    // 3. Cancelar cobranças conflitantes
    await cancelarCobrancasConflitantes(cobranca, logContext);

    // 4. Desativar outras assinaturas ativas (se necessário)
    await desativarOutrasAssinaturas(cobranca, logContext);

    // 5. Ativar assinatura
    await ativarAssinatura(cobranca, vigenciaFim, novoAnchorDate, logContext);

    // 6. Ativar usuário
    await ativarUsuario(cobranca, logContext);

    // 7. Preencher slots restantes automaticamente (Auto-Fill) e buscar dados para notificação
    // Busca informações da assinatura para determinar franquia e plano
    const { data: assinaturaPendente } = await supabaseAdmin
      .from("assinaturas_usuarios")
      .select(`
            id,
            franquia_contratada_cobrancas,
            planos:plano_id (
                slug,
                nome,
                parent:parent_id (
                    slug,
                    nome
                )
            )
        `)
      .eq("id", cobranca.assinatura_usuario_id)
      .single();

    // Se há assinatura pendente, tentar ativar passageiros automaticamente até atingir a franquia
    if (assinaturaPendente) {
      await triggerAtivacaoAutomatica(cobranca, assinaturaPendente, logContext);
    }

    // 8. Enviar Notificação de Confirmação (WhatsApp)
    try {
      const { data: usuario } = await supabaseAdmin
        .from("usuarios")
        .select("nome, telefone")
        .eq("id", cobranca.usuario_id)
        .single();

      // Determinar nome do plano corretamente
      const planoRef = assinaturaPendente?.planos as any;
      const nomePlano = (planoRef?.parent as any)?.nome || planoRef?.nome;

        // NOTIFICAÇÃO REMOVIDA: A notificação agora é enviada pelo ReceiptWorker após gerar o comprovante.
        // Isso evita duplicidade de mensagens (uma sem comprovante e outra com).
        /*
        await notificationService.notifyDriver(
          usuario?.telefone,
          DRIVER_EVENT_PAYMENT_CONFIRMED,
          {
            nomeMotorista: usuario?.nome,
            nomePlano,
            valor: dadosPagamento.valor,
            dataVencimento: vigenciaFim.toISOString().split("T")[0],
            isActivation: isOnboardingPayment,
            reciboUrl,
            mes: new Date(dadosPagamento.dataPagamento).getMonth() + 1,
            ano: new Date(dadosPagamento.dataPagamento).getFullYear()
          }
        );
        */
    } catch (notifError: any) {
      logger.error({ ...logContext, error: notifError.message }, "Erro ao enviar notificação de confirmação de pagamento");
    }

    logger.info({ ...logContext }, "Fluxo completo para pagamento confirmado");

    return { vigenciaFim, isOnboardingPayment };
  } catch (error: any) {
    logger.error({ ...logContext, error: error.message, stack: error.stack }, "Erro ao processar pagamento");
    throw error;
  }
}

/**
 * Calcula a vigência fim e o novo anchor_date baseado no billing_type e situação da assinatura
 */
async function calcularVigenciaFimEAnchorDate(
  cobranca: AssinaturaCobrancaInfo,
  dataPagamentoStr: string,
  logContext: ContextoLog
): Promise<{ vigenciaFim: Date; novoAnchorDate: string | null; isOnboardingPayment: boolean }> {
  const dataPagamentoDate = new Date(dataPagamentoStr);

  // Buscar assinatura atual
  const { data: assinaturaAtual, error: assinaturaError } = await supabaseAdmin
    .from("assinaturas_usuarios")
    .select("id, ativo, vigencia_fim, anchor_date, trial_end_at")
    .eq("id", cobranca.assinatura_usuario_id)
    .maybeSingle();

  if (assinaturaError) {
    logger.error({ ...logContext, assinaturaError }, "Erro ao buscar assinatura atual");
  }

  // Se a assinatura atual não tem vigencia_fim, buscar outras assinaturas ativas do usuário
  let vigenciaFimAtual: string | null = assinaturaAtual?.vigencia_fim || null;
  if (!vigenciaFimAtual) {
    const { data: outrasAssinaturas } = await supabaseAdmin
      .from("assinaturas_usuarios")
      .select("id, vigencia_fim")
      .eq("usuario_id", cobranca.usuario_id)
      .eq("ativo", true)
      .not("vigencia_fim", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (outrasAssinaturas?.vigencia_fim) {
      vigenciaFimAtual = outrasAssinaturas.vigencia_fim;
      logger.info({ ...logContext }, "Usando vigencia_fim de outra assinatura ativa");
    }
  }

  // Verificar se é primeira cobrança de trial
  const isPrimeiraCobrancaTrial = !vigenciaFimAtual && !!assinaturaAtual?.trial_end_at;

  // Calcular vigencia_fim e anchor_date baseado no billing_type
  let vigenciaFim: Date;
  let novoAnchorDate: string | null = null;
  const billingType = cobranca.billing_type || "subscription";

  // Identificar estratégias
  // RESTORED: isProRataUpgrade declaration
  const isProRataUpgrade = [AssinaturaBillingType.UPGRADE_PLAN, AssinaturaBillingType.UPGRADE].includes(billingType as AssinaturaBillingType);

  // Identificar se é uma ativação de fato (Primeiro pagamento ou Startup)
  const isBillingActivation = [AssinaturaBillingType.ACTIVATION, AssinaturaBillingType.EXPANSION].includes(billingType as AssinaturaBillingType);

  // Flag final para indicar se é "Primeiro Pagamento" (Onboarding)
  let isOnboardingPayment = false;

  if (isBillingActivation) {
    // START NEW CYCLE: Data Pagamento + 1 Mês
    novoAnchorDate = dataPagamentoStr;
    vigenciaFim = new Date(dataPagamentoDate);
    vigenciaFim.setMonth(vigenciaFim.getMonth() + 1);
    isOnboardingPayment = true;

    logger.info(
      {
        ...logContext,
        dataPagamento: dataPagamentoStr,
        novoAnchorDate,
        vigenciaFimNova: vigenciaFim.toISOString().split("T")[0],
        billingType
      },
      "Activation/Expansion: Novo ciclo iniciado (Data Pagamento + 1 Mês)"
    );
  } else if (isProRataUpgrade) {
    // PRESERVE CYCLE: Mantém vigência fim da assinatura (já inserida com data correta)
    // Se a assinatura não tiver vigência (ex: upgrade de trial ou manual), calculamos +1 mês como fallback
    if (assinaturaAtual?.vigencia_fim) {
      vigenciaFim = new Date(assinaturaAtual.vigencia_fim);
      // Não altera anchor_date

      logger.info(
        {
          ...logContext,
          vigenciaFimPreservada: vigenciaFim.toISOString().split("T")[0],
          billingType
        },
        "Upgrade Pro-Rata: Ciclo preservado (Mantendo vigencia_fim)"
      );
    } else {
      // Fallback: Se não tem vigência (upgrade de inativo ou erro), inicia ciclo
      novoAnchorDate = dataPagamentoStr;
      vigenciaFim = new Date(dataPagamentoDate);
      vigenciaFim.setMonth(vigenciaFim.getMonth() + 1);
      isOnboardingPayment = true; // Se não tinha vigência, é 'reset'

      logger.warn(
        { ...logContext, billingType },
        "Upgrade sem vigência anterior definida: Iniciando novo ciclo como fallback"
      );
    }
  } else {
    // SUBSCRIPTION (Renovação Mensal)
    if (isPrimeiraCobrancaTrial) {
      novoAnchorDate = dataPagamentoStr;
      vigenciaFim = new Date(dataPagamentoDate);
      vigenciaFim.setMonth(vigenciaFim.getMonth() + 1);
      isOnboardingPayment = true; // Primeira cobrança pós-trial é um marco de onboarding financeiro

      logger.info(
        {
          ...logContext,
          dataPagamento: dataPagamentoStr,
          novoAnchorDate,
          vigenciaFimNova: vigenciaFim.toISOString().split("T")[0],
        },
        "Subscription (primeira trial): data_pagamento + 1 mês e atualizando anchor_date"
      );
    } else if (vigenciaFimAtual) {
      vigenciaFim = new Date(vigenciaFimAtual);
      vigenciaFim.setMonth(vigenciaFim.getMonth() + 1);

      logger.info(
        {
          ...logContext,
          vigenciaFimAnterior: vigenciaFimAtual,
          vigenciaFimNova: vigenciaFim.toISOString().split("T")[0],
          dataVencimentoCobranca: cobranca.data_vencimento,
        },
        "Subscription (renovação): vigencia_fim atual + 1 mês (preserva dia do ciclo)"
      );
    } else {
      novoAnchorDate = dataPagamentoStr;
      vigenciaFim = new Date(dataPagamentoDate);
      vigenciaFim.setMonth(vigenciaFim.getMonth() + 1);
      isOnboardingPayment = true; // Se não tinha vigência atual, é reativação/início

      logger.info(
        {
          ...logContext,
          dataPagamento: dataPagamentoStr,
          novoAnchorDate,
          vigenciaFimNova: vigenciaFim.toISOString().split("T")[0],
        },
        "Subscription (primeira não trial): data_pagamento + 1 mês e atualizando anchor_date"
      );
    }
  }

  return { vigenciaFim, novoAnchorDate, isOnboardingPayment };
}

/**
 * Cancela cobranças conflitantes baseado no billing_type
 */
async function cancelarCobrancasConflitantes(cobranca: AssinaturaCobrancaInfo, logContext: ContextoLog): Promise<void> {
  const billingType = cobranca.billing_type || "subscription";
  const isSpecialBilling = ["upgrade", "upgrade_plan", "activation", "expansion"].includes(billingType);

  if (isSpecialBilling) {
    const { error: cancelSubscriptionError } = await supabaseAdmin
      .from("assinaturas_cobrancas")
      .update({ status: AssinaturaCobrancaStatus.CANCELADA })
      .eq("usuario_id", cobranca.usuario_id)
      .eq("status", AssinaturaCobrancaStatus.PENDENTE_PAGAMENTO)
      .eq("billing_type", "subscription")
      .neq("id", cobranca.id);

    if (cancelSubscriptionError) {
      logger.warn({ ...logContext, cancelSubscriptionError }, "Erro ao cancelar cobranças subscription pendentes");
    } else {
      logger.info({ ...logContext }, "Cobranças de subscription pendentes canceladas devido ao pagamento de upgrade");
    }
  } else {
    const { error: cancelUpgradeError } = await supabaseAdmin
      .from("assinaturas_cobrancas")
      .update({ status: AssinaturaCobrancaStatus.CANCELADA })
      .eq("usuario_id", cobranca.usuario_id)
      .eq("status", AssinaturaCobrancaStatus.PENDENTE_PAGAMENTO)
      .in("billing_type", ["upgrade", "upgrade_plan", "activation", "expansion"])
      .neq("id", cobranca.id);

    if (cancelUpgradeError) {
      logger.warn({ ...logContext, cancelUpgradeError }, "Erro ao cancelar cobranças upgrade pendentes");
    } else {
      logger.info({ ...logContext }, "Cobranças de upgrade pendentes canceladas devido ao pagamento de subscription");
    }
  }
}

/**
 * Desativa outras assinaturas ativas do mesmo usuário (quando uma nova assinatura está sendo ativada)
 */
async function desativarOutrasAssinaturas(cobranca: AssinaturaCobrancaInfo, logContext: ContextoLog): Promise<void> {
  const { data: assinaturaAtual } = await supabaseAdmin
    .from("assinaturas_usuarios")
    .select("id, ativo")
    .eq("id", cobranca.assinatura_usuario_id)
    .maybeSingle();

  if (assinaturaAtual && !assinaturaAtual.ativo) {
    const { data: outrasAtivas } = await supabaseAdmin
      .from("assinaturas_usuarios")
      .select("id")
      .eq("usuario_id", cobranca.usuario_id)
      .eq("ativo", true)
      .neq("id", cobranca.assinatura_usuario_id);

    if (outrasAtivas && outrasAtivas.length > 0) {
      const outrasAssinaturaIds = outrasAtivas.map((a: any) => a.id);

      logger.info({ ...logContext, outrasAssinaturas: outrasAssinaturaIds }, "Desativando outras assinaturas ativas");

      await supabaseAdmin.from("assinaturas_usuarios").update({ ativo: false }).in("id", outrasAssinaturaIds);

      const { error: cancelOutrasCobrancasError } = await supabaseAdmin
        .from("assinaturas_cobrancas")
        .update({ status: AssinaturaCobrancaStatus.CANCELADA })
        .in("assinatura_usuario_id", outrasAssinaturaIds)
        .eq("status", AssinaturaCobrancaStatus.PENDENTE_PAGAMENTO)
        .neq("id", cobranca.id);

      if (cancelOutrasCobrancasError) {
        logger.warn({ ...logContext, cancelOutrasCobrancasError }, "Erro ao cancelar cobranças pendentes das outras assinaturas");
      } else {
        logger.info({ ...logContext, outrasAssinaturas: outrasAssinaturaIds }, "Cobranças pendentes das outras assinaturas canceladas");
      }
    }
  }
}

/**
 * Ativa a assinatura do usuário
 */
async function ativarAssinatura(
  cobranca: AssinaturaCobrancaInfo,
  vigenciaFim: Date,
  novoAnchorDate: string | null,
  logContext: ContextoLog
): Promise<void> {
  const camposAtualizacao: any = {
    status: "ativa",
    ativo: true,
    data_ativacao: new Date().toISOString(),
    vigencia_fim: vigenciaFim.toISOString().split("T")[0],
    trial_end_at: null,
  };

  if (novoAnchorDate) {
    camposAtualizacao.anchor_date = novoAnchorDate;
  }

  const { error: updateAssinaturaError } = await supabaseAdmin
    .from("assinaturas_usuarios")
    .update(camposAtualizacao)
    .eq("id", cobranca.assinatura_usuario_id);

  if (updateAssinaturaError) {
    logger.error({ ...logContext, updateAssinaturaError }, "Erro ao atualizar assinatura");
    throw new Error("Erro ao atualizar assinatura");
  }

  logger.info(
    { ...logContext, vigenciaFim: vigenciaFim.toISOString().split("T")[0] },
    "Assinatura do usuário ativada e vigência atualizada"
  );
}

/**
 * Ativa o usuário
 */
async function ativarUsuario(cobranca: AssinaturaCobrancaInfo, logContext: ContextoLog): Promise<void> {
  const { error: updateUsuarioError } = await supabaseAdmin
    .from("usuarios")
    .update({ ativo: true })
    .eq("id", cobranca.usuario_id);

  if (updateUsuarioError) {
    logger.error({ ...logContext, updateUsuarioError }, "Erro ao ativar usuário");
    throw new Error("Erro ao ativar usuário");
  }

  logger.info({ ...logContext }, "Usuário ativado com sucesso");
}

/**
 * Ativa passageiros automaticamente se for plano Profissional e não precisar seleção manual
 */
async function triggerAtivacaoAutomatica(
  cobranca: AssinaturaCobrancaInfo,
  assinaturaPendente: any,
  logContext: ContextoLog
): Promise<void> {
  const plano = assinaturaPendente.planos as any;
  const slugBase = plano.parent?.slug ?? plano.slug;

  logger.info(
    {
      ...logContext,
      slugBase,
      is_profissional: slugBase === PLANO_PROFISSIONAL,
    },
    "Verificando se deve ativar passageiros automaticamente"
  );

  if (slugBase === PLANO_PROFISSIONAL) {
    const franquia = assinaturaPendente.franquia_contratada_cobrancas || 0;
    logger.info({ ...logContext, usuarioId: cobranca.usuario_id, franquia }, "Chamando ativarPassageirosAutomaticamente");

    try {
      const resultado = await automationService.ativarPassageirosAutomaticamente(cobranca.usuario_id, franquia);
      logger.info(
        {
          ...logContext,
          ativados: resultado.ativados,
          totalAtivos: resultado.totalAtivos,
        },
        "Passageiros ativados automaticamente após confirmação do pagamento"
      );

      // Geração Retroativa de PIX para cobranças atuais/futuras após upgrade para Profissional
      await cobrancaService.gerarPixRetroativo(cobranca.usuario_id);

    } catch (ativacaoError: any) {
      logger.error(
        {
          ...logContext,
          error: ativacaoError.message,
          stack: ativacaoError.stack,
        },
        "Erro ao ativar passageiros automaticamente"
      );
      // Não lançar erro aqui - a ativação da assinatura já foi feita
    }
  } else {
    logger.info({ ...logContext, slugBase }, "Não é plano Profissional - não ativando passageiros automaticamente");
  }
}