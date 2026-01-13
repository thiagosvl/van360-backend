import {
  DRIVER_EVENT_ACTIVATION,
  DRIVER_EVENT_UPGRADE,
  PLANO_ESSENCIAL,
  PLANO_GRATUITO,
  PLANO_PROFISSIONAL
} from "../config/constants.js";
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import { ConfigKey, SubscriptionBillingType, SubscriptionChargeStatus, UserSubscriptionStatus } from "../types/enums.js";
import { onlyDigits } from "../utils/string.utils.js";
import { automationService } from "./automation.service.js";
import { getBillingConfig, getConfigNumber } from "./configuracao.service.js";
import { interService } from "./inter.service.js";
import { notificationService } from "./notifications/notification.service.js";
import { pricingService } from "./pricing.service.js";
import {
  cancelarCobrancaPendente,
  getAssinaturaAtiva,
  getUsuarioData,
  isUpgrade,
  limparAssinaturasPendentes
} from "./subscription.common.js";

// Result Interfaces
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
  message?: string;
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
  subplanoId?: string; 
  precoAplicado?: number;
  precoOrigem?: string;
  message?: string;
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

export const subscriptionUpgradeService = {
    async upgradePlano(
        usuarioId: string,
        novoPlanoId: string
      ): Promise<UpgradePlanoResult> {
        try {
          let assinaturaAtual: any = null;
          try {
            assinaturaAtual = await getAssinaturaAtiva(usuarioId);
          } catch (e) {
            logger.info({ usuarioId }, "Upgrade iniciado sem assinatura ativa: assumindo origem Gratuito/Inativo.");
          }
      
          const planoAtual = assinaturaAtual?.planos;
      
          const { data: novoPlano, error: planoError } = await supabaseAdmin
            .from("planos")
            .select("id, slug, nome, preco, preco_promocional, promocao_ativa, franquia_cobrancas_mes, parent:parent_id(slug)")
            .eq("id", novoPlanoId)
            .single();
      
          if (planoError || !novoPlano) {
            throw new AppError("Plano selecionado não encontrado.", 404);
          }
      
          const slugAtual = planoAtual
            ? ((planoAtual.parent as any)?.slug || planoAtual.slug)
            : PLANO_GRATUITO;
      
          const slugNovo = (novoPlano.parent as any)?.slug || novoPlano.slug;
      
          if (!isUpgrade(slugAtual, slugNovo)) {
            throw new AppError("Esta operação não é um upgrade. Use o endpoint de downgrade.", 400);
          }
      
          await limparAssinaturasPendentes(usuarioId);
      
          const { precoAplicado, precoOrigem, franquiaContratada } = pricingService.calcularPrecosEFranquia(novoPlano);
      
          const hoje = new Date();
          const anchorDate = assinaturaAtual?.anchor_date || hoje.toISOString().split("T")[0];
      
          // Lógica de Trial (Gratuito -> Essencial)
          if (slugNovo === PLANO_ESSENCIAL && slugAtual !== PLANO_PROFISSIONAL) {
            const trialDays = await getConfigNumber(ConfigKey.TRIAL_DIAS_ESSENCIAL, 7);
            const trialEnd = new Date();
            trialEnd.setDate(trialEnd.getDate() + trialDays);
      
            if (assinaturaAtual) {
              await supabaseAdmin
                .from("assinaturas_usuarios")
                .update({ ativo: false })
                .eq("id", assinaturaAtual.id);
            }
      
            const { data: novaAssinatura, error: assinaturaError } = await supabaseAdmin
              .from("assinaturas_usuarios")
              .insert({
                usuario_id: usuarioId,
                plano_id: novoPlano.id,
                franquia_contratada_cobrancas: franquiaContratada,
                ativo: true,
                status: UserSubscriptionStatus.TRIAL,

                preco_aplicado: precoAplicado,
                preco_origem: precoOrigem,
                anchor_date: anchorDate,
                vigencia_fim: null,
                trial_end_at: trialEnd.toISOString()
              })
              .select()
              .single();
      
            if (assinaturaError) throw assinaturaError;
      
            logger.info({ usuarioId, plano: novoPlano.slug }, "Upgrade com Trial de 7 dias ativado com sucesso.");
      
            const { data: cobranca, error: cobrancaError } = await supabaseAdmin
              .from("assinaturas_cobrancas")
              .insert({
                usuario_id: usuarioId,
                assinatura_usuario_id: novaAssinatura.id,
                valor: precoAplicado,
                status: SubscriptionChargeStatus.PENDENTE,
                data_vencimento: trialEnd.toISOString().split("T")[0],
                billing_type: SubscriptionBillingType.UPGRADE_PLAN,
                descricao: `Upgrade de Plano: ${planoAtual?.slug === PLANO_ESSENCIAL ? "Essencial" : "Grátis"} → ${novoPlano.nome} (Período de Testes)`,
              })
              .select()
              .single();
      
            if (cobrancaError) {
              logger.error({ error: cobrancaError, usuarioId }, "Erro ao criar cobrança para trial no upgrade");
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
      
          let billingType = SubscriptionBillingType.ACTIVATION;
          let valorCobrar = precoAplicado;
          let vigenciaFimInsert: string | null = null;
          let descricaoCobranca = `Upgrade de Plano: ${planoAtual?.slug === PLANO_ESSENCIAL ? "Essencial" : "Grátis"} → ${novoPlano.nome}`;
      
          if (assinaturaAtual && assinaturaAtual.vigencia_fim) {
            const billingConfig = await getBillingConfig();
            const precoAtual = Number(assinaturaAtual.preco_aplicado || 0);
            const diferencaMensal = precoAplicado - precoAtual;
      
            const { valorCobrar: valorPR, diasRestantes } = pricingService.calcularValorProRata(
              diferencaMensal,
              assinaturaAtual.vigencia_fim,
              { valorMinimo: billingConfig.valorMinimoProRata, diasBase: billingConfig.diasProRata }
            );
      
            valorCobrar = valorPR;
            billingType = SubscriptionBillingType.UPGRADE_PLAN;
            vigenciaFimInsert = assinaturaAtual.vigencia_fim;
            descricaoCobranca += ` (Pro-Rata: ${diasRestantes} dias)`;
          } else {
            billingType = SubscriptionBillingType.ACTIVATION;
            valorCobrar = precoAplicado;
            vigenciaFimInsert = null;
          }
      
          const { data: novaAssinatura, error: assinaturaError } = await supabaseAdmin
            .from("assinaturas_usuarios")
            .insert({
              usuario_id: usuarioId,
              plano_id: novoPlano.id,
              franquia_contratada_cobrancas: franquiaContratada,
              ativo: false,
              status: UserSubscriptionStatus.PENDENTE_PAGAMENTO,

              preco_aplicado: precoAplicado,
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
              status: SubscriptionChargeStatus.PENDENTE,
              data_vencimento: hoje.toISOString().split("T")[0],
              billing_type: billingType,
              descricao: descricaoCobranca,
            })
            .select()
            .single();
      
          if (cobrancaError) throw cobrancaError;
      
          const usuario = await getUsuarioData(usuarioId);
          const cpf = onlyDigits(usuario.cpfcnpj);
      
          const pixData = await interService.criarCobrancaPix(supabaseAdmin, {
            cobrancaId: cobranca.id,
            valor: valorCobrar,
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
      
          // Envio Imediato do PIX via WhatsApp
          try {
            if (usuario.telefone) {
              const eventType = billingType === SubscriptionBillingType.ACTIVATION ? DRIVER_EVENT_ACTIVATION : DRIVER_EVENT_UPGRADE;
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
      
          return {
            qrCodePayload: pixData.qrCodePayload,
            location: pixData.location,
            inter_txid: pixData.interTransactionId,
            cobrancaId: cobranca.id,
            success: true,
            message: "Upgrade iniciado. O novo limite entrará em vigor IMEDIATAMENTE após a confirmação do pagamento do PIX Pro-rata."
          };
      
        } catch (err: any) {
          logger.error({ error: err.message, usuarioId, novoPlanoId }, "Falha no upgrade de plano.");
          throw new Error(err.message || "Erro desconhecido ao fazer upgrade de plano.");
        }
      },
      
      async downgradePlano(
        usuarioId: string,
        novoPlanoId: string
      ): Promise<DowngradePlanoResult> {
        try {
          const assinaturaAtual = await getAssinaturaAtiva(usuarioId);
          const planoAtual = assinaturaAtual.planos as any;
      
          const { data: novoPlano, error: planoError } = await supabaseAdmin
            .from("planos")
            .select("id, slug, nome, preco, preco_promocional, promocao_ativa, franquia_cobrancas_mes")
            .eq("id", novoPlanoId)
            .single();
      
          if (planoError || !novoPlano) {
            throw new AppError("Plano selecionado não encontrado.", 404);
          }
      
          const slugAtual = (planoAtual.parent as any)?.slug || planoAtual.slug;
      
          if (isUpgrade(slugAtual, novoPlano.slug)) {
            throw new Error("Esta operação não é um downgrade. Use o endpoint de upgrade.");
          }
      
          await cancelarCobrancaPendente(usuarioId);
      
          const { precoAplicado, precoOrigem, franquiaContratada } = pricingService.calcularPrecosEFranquia(novoPlano);
      
          const anchorDate = assinaturaAtual.anchor_date || new Date().toISOString().split("T")[0];
          const vigenciaFim = assinaturaAtual.vigencia_fim || null;
      
          await supabaseAdmin
            .from("assinaturas_usuarios")
            .update({ ativo: false })
            .eq("id", assinaturaAtual.id);
      
          const statusNovo = novoPlano.slug === PLANO_GRATUITO
            ? UserSubscriptionStatus.ATIVA
            : (novoPlano.slug === PLANO_ESSENCIAL && assinaturaAtual.trial_end_at
              ? UserSubscriptionStatus.TRIAL
              : UserSubscriptionStatus.ATIVA);
      
          const { data: novaAssinatura, error: assinaturaError } = await supabaseAdmin
            .from("assinaturas_usuarios")
            .insert({
              usuario_id: usuarioId,
              plano_id: novoPlano.id,
              franquia_contratada_cobrancas: franquiaContratada,
              ativo: true,
              status: statusNovo,

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
      
          if (assinaturaError) throw assinaturaError;
      
          if (novoPlano.slug !== PLANO_GRATUITO && precoAplicado > 0) {
            const hojeDate = new Date();
            const vigenciaFimDate = assinaturaAtual.vigencia_fim ? new Date(assinaturaAtual.vigencia_fim) : hojeDate;
            const cobrancaDate = vigenciaFimDate > hojeDate ? vigenciaFimDate : hojeDate;
            const dataVencimentoCobranca = cobrancaDate.toISOString().split("T")[0];
      
            const { data: cobrancaNova, error: cobrancaError } = await supabaseAdmin
              .from("assinaturas_cobrancas")
              .insert({
                usuario_id: usuarioId,
                assinatura_usuario_id: novaAssinatura.id,
                valor: precoAplicado,
                status: SubscriptionChargeStatus.PENDENTE,
                data_vencimento: dataVencimentoCobranca,
                billing_type: SubscriptionBillingType.DOWNGRADE,
                descricao: `Downgrade de Plano - ${novoPlano.nome}`,
              })
              .select()
              .single();
      
            if (cobrancaError) throw cobrancaError;
      
            try {
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
              }
            } catch (pixErr: any) {
              logger.error({ err: pixErr.message }, "Erro ao gerar PIX no Downgrade");
            }
          }
      
          if (slugAtual === PLANO_PROFISSIONAL || (planoAtual.parent as any)?.slug === PLANO_PROFISSIONAL) {
            try {
              const desativados = await automationService.desativarAutomacaoTodosPassageiros(usuarioId);
              logger.info({ usuarioId, desativados }, "Automação de passageiros desativada devido ao downgrade");
            } catch (autoError: any) {
              logger.error({ usuarioId, error: autoError.message }, "Erro ao desativar automação de passageiros no downgrade");
            }
          }
      
          return { success: true };
      
        } catch (err: any) {
          logger.error({ error: err.message, usuarioId, novoPlanoId }, "Falha no downgrade de plano.");
          throw new Error(err.message || "Erro desconhecido ao fazer downgrade de plano.");
        }
      },
      
      async trocarSubplano(
        usuarioId: string,
        novoSubplanoId: string
      ): Promise<TrocaSubplanoResult> {
        try {
          const assinaturaAtual = await getAssinaturaAtiva(usuarioId);
          const planoAtual = assinaturaAtual.planos as any;
      
          const isProfissionalBase = planoAtual.slug === PLANO_PROFISSIONAL;
          const isProfissionalSub = !!planoAtual.parent_id;
          const estaNoProfissional = isProfissionalBase || isProfissionalSub;
      
          const { data: novoSubplano, error: planoError } = await supabaseAdmin
            .from("planos")
            .select("id, slug, nome, preco, preco_promocional, promocao_ativa, franquia_cobrancas_mes, parent_id")
            .eq("id", novoSubplanoId)
            .single();
      
          if (planoError || !novoSubplano) {
            throw new Error("Subplano selecionado não encontrado.");
          }
      
          const { data: planoProfissionalBase, error: planoBaseError } = await supabaseAdmin
            .from("planos")
            .select("id")
            .eq("slug", PLANO_PROFISSIONAL)
            .eq("tipo", "base")
            .single();
      
          if (planoBaseError || !planoProfissionalBase) {
            throw new Error("Plano Profissional não encontrado.");
          }
      
          if (novoSubplano.parent_id !== planoProfissionalBase.id) {
            throw new Error("Subplano inválido. Deve pertencer ao plano Profissional.");
          }
      
          if (!estaNoProfissional) {
            await limparAssinaturasPendentes(usuarioId);
            await cancelarCobrancaPendente(usuarioId);
      
            const { precoAplicado, precoOrigem, franquiaContratada } = pricingService.calcularPrecosEFranquia(novoSubplano);
      
            const anchorDate = assinaturaAtual.anchor_date || new Date().toISOString().split("T")[0];
            const vigenciaFim = assinaturaAtual.vigencia_fim || null;
      
            const { data: novaAssinatura, error: assinaturaError } = await supabaseAdmin
              .from("assinaturas_usuarios")
              .insert({
                usuario_id: usuarioId,
                plano_id: novoSubplano.id,
                franquia_contratada_cobrancas: franquiaContratada,
                ativo: false,
                status: UserSubscriptionStatus.PENDENTE_PAGAMENTO,

                preco_aplicado: precoAplicado,
                preco_origem: precoOrigem,
                anchor_date: anchorDate,
                vigencia_fim: vigenciaFim,
              })
              .select()
              .single();
      
            if (assinaturaError) throw assinaturaError;
      
            const hoje = new Date();
            const { data: cobranca, error: cobrancaError } = await supabaseAdmin
              .from("assinaturas_cobrancas")
              .insert({
                usuario_id: usuarioId,
                assinatura_usuario_id: novaAssinatura.id,
                valor: precoAplicado,
                status: SubscriptionChargeStatus.PENDENTE,
                data_vencimento: hoje.toISOString().split("T")[0],
                billing_type: SubscriptionBillingType.UPGRADE_PLAN,
                descricao: `Upgrade de Plano: ${planoAtual.nome} → ${novoSubplano.nome}`,
              })
              .select()
              .single();
      
            if (cobrancaError) throw cobrancaError;
      
            const franquiaAtual = assinaturaAtual.franquia_contratada_cobrancas || 0;
            if (franquiaContratada < franquiaAtual) {
              throw new Error("Não é permitido reduzir a franquia do plano Profissional. Entre em contato com o suporte.");
            }
      
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
              success: true,
            };
          }
      
          const { precoAplicado, precoOrigem, franquiaContratada } = pricingService.calcularPrecosEFranquia(novoSubplano);
          const billingConfig = await getBillingConfig();
          const precoAtual = Number(assinaturaAtual.preco_aplicado || 0);
          const diferencaMensal = precoAplicado - precoAtual;
          const franquiaAtual = assinaturaAtual.franquia_contratada_cobrancas || 0;
      
          const isDowngrade = diferencaMensal < 0 || (diferencaMensal === 0 && franquiaContratada <= franquiaAtual);
      
          let { valorCobrar: diferenca, diasRestantes } = pricingService.calcularValorProRata(
            diferencaMensal,
            assinaturaAtual.vigencia_fim || undefined,
            { valorMinimo: billingConfig.valorMinimoProRata, diasBase: billingConfig.diasProRata }
          );
      
          if (!isDowngrade && diferenca < billingConfig.valorMinimoProRata) {
            diferenca = billingConfig.valorMinimoProRata;
          }
      
          if (franquiaContratada < franquiaAtual) {
            throw new Error("Não é permitido reduzir a franquia do plano Profissional. Entre em contato com o suporte.");
          }
      
          const anchorDate = assinaturaAtual.anchor_date || new Date().toISOString().split("T")[0];
          const vigenciaFim = assinaturaAtual.vigencia_fim || null;
      
          if (diferenca > 0) {
            await limparAssinaturasPendentes(usuarioId);
            await cancelarCobrancaPendente(usuarioId);
      
            const { data: novaAssinatura, error: assinaturaError } = await supabaseAdmin
              .from("assinaturas_usuarios")
              .insert({
                usuario_id: usuarioId,
                plano_id: novoSubplano.id,
                franquia_contratada_cobrancas: franquiaContratada,
                ativo: false,
                status: UserSubscriptionStatus.PENDENTE_PAGAMENTO,

                preco_aplicado: precoAplicado,
                preco_origem: precoOrigem,
                anchor_date: anchorDate,
                vigencia_fim: vigenciaFim,
              })
              .select()
              .single();
      
            if (assinaturaError) throw assinaturaError;
      
            const hoje = new Date();
            const { data: cobranca, error: cobrancaError } = await supabaseAdmin
              .from("assinaturas_cobrancas")
              .insert({
                usuario_id: usuarioId,
                assinatura_usuario_id: novaAssinatura.id,
                valor: diferenca,
                status: SubscriptionChargeStatus.PENDENTE,
                data_vencimento: hoje.toISOString().split("T")[0],
                billing_type: SubscriptionBillingType.EXPANSION,
                descricao: `Expansão de Limite: ${assinaturaAtual.franquia_contratada_cobrancas} → ${franquiaContratada} passageiros`,
              })
              .select()
              .single();
      
            if (cobrancaError) throw cobrancaError;
      
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
      
            return {
              qrCodePayload: pixData.qrCodePayload,
              location: pixData.location,
              inter_txid: pixData.interTransactionId,
              cobrancaId: cobranca.id,
              success: true,
            };
          } else {
            await supabaseAdmin
              .from("assinaturas_usuarios")
              .update({ ativo: false })
              .eq("id", assinaturaAtual.id);
      
            const { data: novaAssinatura, error: assinaturaError } = await supabaseAdmin
              .from("assinaturas_usuarios")
              .insert({
                usuario_id: usuarioId,
                plano_id: novoSubplano.id,
                franquia_contratada_cobrancas: franquiaContratada,
                ativo: true,
                status: UserSubscriptionStatus.ATIVA,

                preco_aplicado: precoAplicado,
                preco_origem: precoOrigem,
                anchor_date: anchorDate,
                vigencia_fim: vigenciaFim,
              })
              .select()
              .single();
      
            if (assinaturaError) throw assinaturaError;
      
            return {
              success: true,
            };
          }
        } catch (err: any) {
          logger.error({ error: err.message, usuarioId, novoSubplanoId }, "Falha na troca de subplano.");
          throw new Error(err.message || "Erro desconhecido ao trocar subplano.");
        }
      },
      
      async criarAssinaturaProfissionalPersonalizado(
        usuarioId: string,
        quantidade: number,
      ): Promise<CriarAssinaturaPersonalizadaResult> {
        try {
          const { precoCalculado } = await pricingService.calcularPrecoPersonalizado(quantidade, true);
      
          let assinaturaAtual = null;
          let isDowngrade = false;
          try {
            assinaturaAtual = await getAssinaturaAtiva(usuarioId);
            const franquiaAtual = assinaturaAtual.franquia_contratada_cobrancas || 0;
            if (quantidade === franquiaAtual) {
              throw new Error("Você já possui esta quantidade de passageiros contratados.");
            }
            isDowngrade = quantidade < franquiaAtual;
          } catch (err) {
            if (err instanceof Error && err.message.includes("já possui esta quantidade")) {
              throw err;
            }
          }
      
          const { data: planoProfissionalBase, error: planoBaseError } = await supabaseAdmin
            .from("planos")
            .select("id")
            .eq("slug", PLANO_PROFISSIONAL)
            .eq("tipo", "base")
            .single();
      
          if (planoBaseError || !planoProfissionalBase) {
            throw new Error("Plano Profissional não encontrado.");
          }
      
          if (isDowngrade && assinaturaAtual) {
            throw new Error("Não é permitido reduzir a franquia do plano Profissional. Entre em contato com o suporte.");
          }
      
          await limparAssinaturasPendentes(usuarioId);
          await cancelarCobrancaPendente(usuarioId);
      
          const anchorDate = assinaturaAtual?.anchor_date || new Date().toISOString().split("T")[0];
          const vigenciaFim = assinaturaAtual?.vigencia_fim || null;
      
          const { data: novaAssinatura, error: assinaturaError } = await supabaseAdmin
            .from("assinaturas_usuarios")
            .insert({
              usuario_id: usuarioId,
              plano_id: planoProfissionalBase.id,
              franquia_contratada_cobrancas: quantidade,
              ativo: false,
              status: UserSubscriptionStatus.PENDENTE_PAGAMENTO,

              preco_aplicado: precoCalculado,
              preco_origem: "personalizado",
              anchor_date: anchorDate,
              vigencia_fim: vigenciaFim,
            })
            .select()
            .single();
      
          if (assinaturaError) throw assinaturaError;
          const billingType = assinaturaAtual ? SubscriptionBillingType.UPGRADE_PLAN : SubscriptionBillingType.SUBSCRIPTION;
          let valorCobranca = precoCalculado;
      
          if (assinaturaAtual) {
            const precoAtual = Number(assinaturaAtual.preco_aplicado || 0);
      
            if (precoAtual <= 0) {
              valorCobranca = precoCalculado;
            } else {
              const config = await getBillingConfig();
              const diferencaMensal = precoCalculado - precoAtual;
              const { valorCobrar } = pricingService.calcularValorProRata(
                diferencaMensal,
                assinaturaAtual.vigencia_fim || undefined,
                { valorMinimo: config.valorMinimoProRata, diasBase: config.diasProRata }
              );
              valorCobranca = valorCobrar;
      
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
              status: SubscriptionChargeStatus.PENDENTE,
              data_vencimento: hoje.toISOString().split("T")[0],
              billing_type: billingType === SubscriptionBillingType.SUBSCRIPTION ? SubscriptionBillingType.ACTIVATION : SubscriptionBillingType.EXPANSION,
              descricao: billingType === SubscriptionBillingType.SUBSCRIPTION
                ? `Ativação de Plano Profissional (${quantidade} passageiros)`
                : `Expansão de Limite: ${assinaturaAtual!.franquia_contratada_cobrancas} → ${quantidade} passageiros`,
            })
            .select()
            .single();
      
          if (cobrancaError) throw cobrancaError;
      
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
};
