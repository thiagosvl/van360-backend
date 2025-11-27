import { logger } from "../config/logger";
import { supabaseAdmin } from "../config/supabase";
import { passageiroService } from "./passageiro.service";
import {
  ASSINATURA_COBRANCA_STATUS_PAGO,
  ASSINATURA_COBRANCA_STATUS_PENDENTE_PAGAMENTO,
  ASSINATURA_COBRANCA_STATUS_CANCELADA,
  ASSINATURA_COBRANCA_TIPO_PAGAMENTO_PIX,
  PLANO_COMPLETO,
} from "../config/contants";

interface DadosPagamento {
  valor: number;
  dataPagamento: string;
  txid?: string;
}

interface Cobranca {
  id: string;
  usuario_id: string;
  assinatura_usuario_id: string;
  status: string;
  data_vencimento?: string;
  billing_type?: string;
  inter_txid?: string;
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
export async function processarPagamentoCobranca(
  cobranca: Cobranca,
  dadosPagamento: DadosPagamento,
  contextoLog: ContextoLog = {}
): Promise<void> {
  const { txid, cobrancaId } = contextoLog;
  const logContext = txid ? { txid } : { cobrancaId };

  try {
    // 1. Atualizar status da cobrança para pago
    const { error: updateCobrancaError, data: updatedCobranca } = await supabaseAdmin
      .from("assinaturas_cobrancas")
      .update({
        status: ASSINATURA_COBRANCA_STATUS_PAGO,
        data_pagamento: dadosPagamento.dataPagamento,
        valor_pago: dadosPagamento.valor,
        tipo_pagamento: ASSINATURA_COBRANCA_TIPO_PAGAMENTO_PIX,
      })
      .eq("id", cobranca.id)
      .select();

    const updateCount = updatedCobranca?.length || 0;

    if (updateCobrancaError) {
      logger.error({ ...logContext, updateCobrancaError }, "Erro ao atualizar cobrança");
      throw new Error("Erro ao atualizar cobrança");
    }

    if (updateCount === 0) {
      logger.warn({ ...logContext }, "Nenhuma cobrança atualizada");
      throw new Error("Nenhuma cobrança foi atualizada");
    }

    logger.info({ ...logContext }, "Cobrança atualizada com sucesso");

    // 2. Calcular vigencia_fim e anchor_date
    const { vigenciaFim, novoAnchorDate } = await calcularVigenciaFimEAnchorDate(
      cobranca,
      dadosPagamento.dataPagamento,
      logContext
    );

    // 3. Cancelar cobranças conflitantes
    await cancelarCobrancasConflitantes(cobranca, logContext);

    // 4. Desativar outras assinaturas ativas (se necessário)
    await desativarOutrasAssinaturas(cobranca, logContext);

    // 5. Verificar se há seleção de passageiros salva na cobrança
    const { data: cobrancaCompleta } = await supabaseAdmin
      .from("assinaturas_cobrancas")
      .select("selecao_passageiros_pendente")
      .eq("id", cobranca.id)
      .single();

    const selecaoSalva = cobrancaCompleta?.selecao_passageiros_pendente as {
      passageiroIds?: string[];
      tipo?: "upgrade" | "downgrade";
      franquia?: number;
      criadoEm?: string;
    } | null;

    // 6. Ativar assinatura
    await ativarAssinatura(cobranca, vigenciaFim, novoAnchorDate, logContext);

    // 7. Ativar usuário
    await ativarUsuario(cobranca, logContext);

    // 8. Aplicar seleção de passageiros (se houver) ou ativar automaticamente
    if (selecaoSalva?.passageiroIds && selecaoSalva.passageiroIds.length > 0) {
      // Aplicar seleção salva
      try {
        const resultado = await passageiroService.confirmarSelecaoPassageiros(
          cobranca.usuario_id,
          selecaoSalva.passageiroIds,
          selecaoSalva.franquia || 0
        );
        
        logger.info(
          {
            ...logContext,
            ativados: resultado.ativados,
            desativados: resultado.desativados,
            passageirosSelecionados: selecaoSalva.passageiroIds.length,
          },
          "Seleção de passageiros aplicada após confirmação do pagamento"
        );

        // Limpar seleção da cobrança
        await supabaseAdmin
          .from("assinaturas_cobrancas")
          .update({ selecao_passageiros_pendente: null })
          .eq("id", cobranca.id);
      } catch (selecaoError: any) {
        logger.error(
          {
            ...logContext,
            error: selecaoError.message,
            stack: selecaoError.stack,
          },
          "Erro ao aplicar seleção de passageiros salva"
        );
        // Não lançar erro aqui - a ativação da assinatura já foi feita
      }
    } else {
      // Se não há seleção salva, verificar se precisa seleção manual
      const { precisaSelecaoManual, assinaturaPendente } = await verificarSelecaoManualNecessaria(
        cobranca,
        logContext
      );

      // Se não precisa seleção manual, ativar automaticamente
      if (!precisaSelecaoManual && assinaturaPendente) {
        await ativarPassageirosAutomaticamente(cobranca, assinaturaPendente, logContext);
      }
    }

    logger.info({ ...logContext }, "Fluxo completo para pagamento confirmado");
  } catch (error: any) {
    logger.error({ ...logContext, error: error.message, stack: error.stack }, "Erro ao processar pagamento");
    throw error;
  }
}

/**
 * Calcula a vigência fim e o novo anchor_date baseado no billing_type e situação da assinatura
 */
async function calcularVigenciaFimEAnchorDate(
  cobranca: Cobranca,
  dataPagamentoStr: string,
  logContext: ContextoLog
): Promise<{ vigenciaFim: Date; novoAnchorDate: string | null }> {
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

  if (billingType === "upgrade") {
    novoAnchorDate = dataPagamentoStr;
    vigenciaFim = new Date(dataPagamentoDate);
    vigenciaFim.setMonth(vigenciaFim.getMonth() + 1);

    logger.info(
      {
        ...logContext,
        dataPagamento: dataPagamentoStr,
        novoAnchorDate,
        vigenciaFimNova: vigenciaFim.toISOString().split("T")[0],
      },
      "Upgrade: atualizando anchor_date e vigencia_fim baseado em data_pagamento"
    );
  } else {
    // Para subscription
    if (isPrimeiraCobrancaTrial) {
      novoAnchorDate = dataPagamentoStr;
      vigenciaFim = new Date(dataPagamentoDate);
      vigenciaFim.setMonth(vigenciaFim.getMonth() + 1);

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

  return { vigenciaFim, novoAnchorDate };
}

/**
 * Cancela cobranças conflitantes baseado no billing_type
 */
async function cancelarCobrancasConflitantes(cobranca: Cobranca, logContext: ContextoLog): Promise<void> {
  const billingType = cobranca.billing_type || "subscription";

  if (billingType === "upgrade") {
    const { error: cancelSubscriptionError } = await supabaseAdmin
      .from("assinaturas_cobrancas")
      .update({ status: ASSINATURA_COBRANCA_STATUS_CANCELADA })
      .eq("usuario_id", cobranca.usuario_id)
      .eq("status", ASSINATURA_COBRANCA_STATUS_PENDENTE_PAGAMENTO)
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
      .update({ status: ASSINATURA_COBRANCA_STATUS_CANCELADA })
      .eq("usuario_id", cobranca.usuario_id)
      .eq("status", ASSINATURA_COBRANCA_STATUS_PENDENTE_PAGAMENTO)
      .eq("billing_type", "upgrade")
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
async function desativarOutrasAssinaturas(cobranca: Cobranca, logContext: ContextoLog): Promise<void> {
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
      const outrasAssinaturaIds = outrasAtivas.map((a) => a.id);

      logger.info({ ...logContext, outrasAssinaturas: outrasAssinaturaIds }, "Desativando outras assinaturas ativas");

      await supabaseAdmin.from("assinaturas_usuarios").update({ ativo: false }).in("id", outrasAssinaturaIds);

      const { error: cancelOutrasCobrancasError } = await supabaseAdmin
        .from("assinaturas_cobrancas")
        .update({ status: ASSINATURA_COBRANCA_STATUS_CANCELADA })
        .in("assinatura_usuario_id", outrasAssinaturaIds)
        .eq("status", ASSINATURA_COBRANCA_STATUS_PENDENTE_PAGAMENTO)
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
 * Verifica se precisa seleção manual de passageiros antes de ativar a assinatura
 */
async function verificarSelecaoManualNecessaria(
  cobranca: Cobranca,
  logContext: ContextoLog
): Promise<{ precisaSelecaoManual: boolean; assinaturaPendente: any }> {
  const { data: assinaturaPendente, error: assinaturaPendenteError } = await supabaseAdmin
    .from("assinaturas_usuarios")
    .select(`
      id,
      franquia_contratada_cobrancas,
      planos:plano_id (
        slug,
        parent:parent_id (
          slug
        )
      )
    `)
    .eq("id", cobranca.assinatura_usuario_id)
    .single();

  let precisaSelecaoManual = false;

  if (!assinaturaPendenteError && assinaturaPendente) {
    const plano = assinaturaPendente.planos as any;
    const slugBase = plano.parent?.slug ?? plano.slug;

    logger.info(
      {
        ...logContext,
        slugBase,
        franquia: assinaturaPendente.franquia_contratada_cobrancas,
      },
      "Verificando se precisa seleção manual de passageiros"
    );

    if (slugBase === PLANO_COMPLETO) {
      const franquia = assinaturaPendente.franquia_contratada_cobrancas || 0;
      const calculo = await passageiroService.calcularPassageirosDisponiveis(cobranca.usuario_id, franquia);
      precisaSelecaoManual = calculo.precisaSelecaoManual;

      logger.info(
        {
          ...logContext,
          usuarioId: cobranca.usuario_id,
          franquia,
          jaAtivos: calculo.jaAtivos,
          disponiveisParaAtivar: calculo.disponiveisParaAtivar,
          totalPossivel: calculo.totalPossivel,
          precisaSelecaoManual,
        },
        "Resultado do cálculo de passageiros disponíveis"
      );

      if (precisaSelecaoManual) {
        logger.warn(
          {
            ...logContext,
            usuarioId: cobranca.usuario_id,
            franquia,
            totalPossivel: calculo.totalPossivel,
            jaAtivos: calculo.jaAtivos,
          },
          "Pagamento confirmado mas precisa seleção manual - ativando assinatura mas não passageiros"
        );
      } else {
        logger.info(
          {
            ...logContext,
            usuarioId: cobranca.usuario_id,
            franquia,
            totalPossivel: calculo.totalPossivel,
          },
          "Não precisa seleção manual - passageiros serão ativados automaticamente após ativação da assinatura"
        );
      }
    } else {
      logger.info({ ...logContext, slugBase }, "Não é plano Completo - não precisa verificar seleção manual");
    }
  } else {
    logger.warn(
      {
        ...logContext,
        assinaturaPendenteError: assinaturaPendenteError?.message,
        temAssinaturaPendente: !!assinaturaPendente,
      },
      "Erro ao buscar assinatura pendente ou assinatura não encontrada"
    );
  }

  return { precisaSelecaoManual, assinaturaPendente };
}

/**
 * Ativa a assinatura do usuário
 */
async function ativarAssinatura(
  cobranca: Cobranca,
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
async function ativarUsuario(cobranca: Cobranca, logContext: ContextoLog): Promise<void> {
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
 * Ativa passageiros automaticamente se for plano Completo e não precisar seleção manual
 */
async function ativarPassageirosAutomaticamente(
  cobranca: Cobranca,
  assinaturaPendente: any,
  logContext: ContextoLog
): Promise<void> {
  const plano = assinaturaPendente.planos as any;
  const slugBase = plano.parent?.slug ?? plano.slug;

  logger.info(
    {
      ...logContext,
      slugBase,
      precisaSelecaoManual: false,
      isCompleto: slugBase === PLANO_COMPLETO,
    },
    "Verificando se deve ativar passageiros automaticamente"
  );

  if (slugBase === PLANO_COMPLETO) {
    const franquia = assinaturaPendente.franquia_contratada_cobrancas || 0;
    logger.info({ ...logContext, usuarioId: cobranca.usuario_id, franquia }, "Chamando ativarPassageirosAutomaticamente");

    try {
      const resultado = await passageiroService.ativarPassageirosAutomaticamente(cobranca.usuario_id, franquia);
      logger.info(
        {
          ...logContext,
          ativados: resultado.ativados,
          totalAtivos: resultado.totalAtivos,
        },
        "Passageiros ativados automaticamente após confirmação do pagamento"
      );
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
    logger.info({ ...logContext, slugBase }, "Não é plano Completo - não ativando passageiros automaticamente");
  }
}

