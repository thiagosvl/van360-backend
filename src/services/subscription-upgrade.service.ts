import crypto from "node:crypto";
import {
    DRIVER_EVENT_ACTIVATION,
    DRIVER_EVENT_UPGRADE,
    PLANO_ESSENCIAL,
    PLANO_PROFISSIONAL
} from "../config/constants.js";
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import { AssinaturaBillingType, AssinaturaCobrancaStatus, AssinaturaStatus, AtividadeAcao, AtividadeEntidadeTipo } from "../types/enums.js";
import { toLocalDateString } from "../utils/date.utils.js";
import { onlyDigits } from "../utils/string.utils.js";
import { assinaturaCobrancaService } from "./assinatura-cobranca.service.js";
import { automationService } from "./automation.service.js";
import { getBillingConfig } from "./configuracao.service.js";
import { historicoService } from "./historico.service.js";
import { notificationService } from "./notifications/notification.service.js";
import { paymentService } from "./payment.service.js";
import { pricingService } from "./pricing.service.js";
import {
    cancelarCobrancaPendente,
    getAssinaturaAtiva,
    getUsuarioData,
    isUpgrade,
    limparAssinaturasPendentes,
    validarFranquiaPassageiros
} from "./subscription.common.js";

// Result Interfaces
export interface UpgradePlanoResult {
  qrCodePayload?: string;
  location?: string;
  gateway_txid?: string;
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
  gateway_txid?: string;
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
  gateway_txid?: string;
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
            logger.info({ usuarioId }, "Upgrade iniciado sem assinatura ativa.");
          }
      
          const planoAtual = assinaturaAtual?.planos;
      
          const { data: novoPlano, error: planoError } = await supabaseAdmin
            .from("planos")
            .select("id, slug, nome, preco, preco_promocional, promocao_ativa, franquia_cobrancas_mes, parent:parent_id(nome, slug)")
            .eq("id", novoPlanoId)
            .single();
      
          if (planoError || !novoPlano) {
            throw new AppError("Plano selecionado não encontrado.", 404);
          }
      
          const slugAtual = planoAtual
            ? ((planoAtual.parent as any)?.slug || planoAtual.slug)
            : null;
      
          const slugNovo = (novoPlano.parent as any)?.slug || novoPlano.slug;
      
          if (!isUpgrade(slugAtual, slugNovo)) {
            throw new AppError("Esta operação não é um upgrade. Use o endpoint de downgrade.", 400);
          }
      
          const { franquiaContratada: franquiaNovoPlano } = pricingService.calcularPrecosEFranquia(novoPlano);
          await validarFranquiaPassageiros(usuarioId, franquiaNovoPlano);

          // --- ITEM 2: REAPROVEITAMENTO ---
          // Buscar se já existe uma assinatura pendente idêntica (mesmo plano e franquia)
          const { data: assinaturaExistente } = await supabaseAdmin
            .from("assinaturas_usuarios")
            .select("id, status, plano_id, franquia_contratada_cobrancas")
            .eq("usuario_id", usuarioId)
            .eq("status", AssinaturaStatus.PENDENTE_PAGAMENTO)
            .eq("plano_id", novoPlanoId)
            .eq("franquia_contratada_cobrancas", pricingService.calcularPrecosEFranquia(novoPlano).franquiaContratada)
            .maybeSingle();

          if (assinaturaExistente) {
             const { data: cobrancaExistente } = await supabaseAdmin
                .from("assinaturas_cobrancas")
                .select("id, status")
                .eq("assinatura_usuario_id", assinaturaExistente.id)
                .eq("status", AssinaturaCobrancaStatus.PENDENTE_PAGAMENTO)
                .maybeSingle();

             if (cobrancaExistente) {
                logger.info({ usuarioId, cobrancaId: cobrancaExistente.id }, "Reutilizando PIX de upgrade pendente já existente.");
                const result = await assinaturaCobrancaService.gerarPixParaCobranca(cobrancaExistente.id);
                return {
                    ...result,
                    success: true,
                    message: "Você já possui um upgrade deste plano pendente. Use o QR Code abaixo para concluir."
                };
             }
          }

          await limparAssinaturasPendentes(usuarioId);

      
          const { precoAplicado, precoOrigem, franquiaContratada } = pricingService.calcularPrecosEFranquia(novoPlano);
      
          const hoje = new Date();
          const hojeStr = toLocalDateString(hoje);
          const anchorDate = assinaturaAtual?.anchor_date || hojeStr;
      

      
          let billingType = AssinaturaBillingType.ACTIVATION;
          let valorCobrar = precoAplicado;
          let vigenciaFimInsert: string | null = null;
          let descricaoCobranca = `Upgrade de Plano: ${planoAtual?.slug === PLANO_ESSENCIAL ? "Essencial" : "Novo"} → ${novoPlano.nome}`;
      
          const isRestricted = assinaturaAtual?.status === AssinaturaStatus.SUSPENSA || 
                               assinaturaAtual?.status === AssinaturaStatus.CANCELADA ||
                               (assinaturaAtual?.status === AssinaturaStatus.TRIAL && new Date(assinaturaAtual?.trial_end_at) < new Date());

          if (assinaturaAtual && assinaturaAtual.vigencia_fim && !isRestricted) {
            const billingConfig = await getBillingConfig();
            const precoAtual = Number(assinaturaAtual.preco_aplicado || 0);
            const diferencaMensal = precoAplicado - precoAtual;
      
            const { valorCobrar: valorPR, diasRestantes } = pricingService.calcularValorProRata(
              diferencaMensal,
              assinaturaAtual.vigencia_fim,
              { valorMinimo: billingConfig.valorMinimoProRata, diasBase: billingConfig.diasProRata }
            );
      
            valorCobrar = valorPR;
            billingType = AssinaturaBillingType.UPGRADE_PLAN;
            vigenciaFimInsert = assinaturaAtual.vigencia_fim;
            descricaoCobranca += ` (Pro-Rata: ${diasRestantes} dias)`;
          } else if (isRestricted) {
            billingType = AssinaturaBillingType.ACTIVATION;
            valorCobrar = precoAplicado;
            vigenciaFimInsert = null;
            descricaoCobranca = `Reativação de Plano: ${novoPlano.nome}`;
          } else {
            billingType = AssinaturaBillingType.ACTIVATION;
            valorCobrar = precoAplicado;
            vigenciaFimInsert = null;
          }
      
          if (valorCobrar <= 0 && !isRestricted) {
            // Case 1: No financial difference (Side-grade or pricing edge case)
            // We just deactivate the old one and activate the new one immediately
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
                status: AssinaturaStatus.ATIVA,
                preco_aplicado: precoAplicado,
                preco_origem: precoOrigem,
                anchor_date: anchorDate,
                vigencia_fim: vigenciaFimInsert,
              })
              .select()
              .single();

            if (assinaturaError) throw assinaturaError;

            return {
              success: true,
              message: "Upgrade concluído com sucesso. Como não há diferença de valores para o período atual, o novo limite já está liberado!",
              planoId: novoPlano.id,
              franquia: franquiaContratada
            };
          }

          // Case 2: There is a pro-rata to pay
          const { data: novaAssinatura, error: assinaturaError } = await supabaseAdmin
            .from("assinaturas_usuarios")
            .insert({
              usuario_id: usuarioId,
              plano_id: novoPlano.id,
              franquia_contratada_cobrancas: franquiaContratada,
              ativo: false,
              status: AssinaturaStatus.PENDENTE_PAGAMENTO,

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
              status: AssinaturaCobrancaStatus.PENDENTE_PAGAMENTO,
              data_vencimento: hojeStr,
              billing_type: billingType,
              descricao: descricaoCobranca,
            })
            .select()
            .single();
      
          if (cobrancaError) throw cobrancaError;
      
          const usuario = await getUsuarioData(usuarioId);
          const cpf = onlyDigits(usuario.cpfcnpj);
      
          const provider = paymentService.getProvider();
          
          // IDEMPOTÊNCIA STABLE: Hash do ID + valor.
          // Como limpamos pendentes antes, o cobranca.id é único para esta tentativa de upgrade.
          const txidToUse = crypto.createHash('md5').update(`${cobranca.id}-${valorCobrar}`).digest('hex');

          const pixData = await provider.criarCobrancaImediata({
            cobrancaId: txidToUse,
            valor: valorCobrar,
            cpf,
            nome: usuario.nome,
          });
      
      
          await supabaseAdmin
            .from("assinaturas_cobrancas")
            .update({
              gateway_txid: pixData.gatewayTransactionId,
              qr_code_payload: pixData.qrCodePayload,
              location_url: pixData.location,
            })
            .eq("id", cobranca.id);
      
          // Envio Imediato do PIX via WhatsApp
          try {
            if (usuario.telefone) {
              const eventType = billingType === AssinaturaBillingType.ACTIVATION ? DRIVER_EVENT_ACTIVATION : DRIVER_EVENT_UPGRADE;
              notificationService.notifyDriver(usuario.telefone, eventType, {
                nomeMotorista: usuario.nome,
                nomePlano: (novoPlano.parent as any)?.nome || novoPlano.nome,
                valor: precoAplicado,
                dataVencimento: hojeStr,
                pixPayload: pixData.qrCodePayload
              }).catch(err => logger.error({ err }, "Falha ao enviar PIX imediato no upgrade"));
            }
          } catch (notifErr) {
            logger.error({ notifErr }, "Erro no bloco de notificação imediata");
          }

          // --- LOG DE AUDITORIA ---
          historicoService.log({
              usuario_id: usuarioId,
              entidade_tipo: AtividadeEntidadeTipo.ASSINATURA,
              entidade_id: novaAssinatura.id,
              acao: AtividadeAcao.ASSINATURA_UPGRADE,
              descricao: `Upgrade solicitado: ${planoAtual?.nome || 'Anterior'} → ${novoPlano.nome}.`,
              meta: { plano: novoPlano.slug, valor: valorCobrar }
          });
      
          return {
            qrCodePayload: pixData.qrCodePayload,
            location: pixData.location,
            gateway_txid: pixData.gatewayTransactionId,
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
            .select("id, slug, nome, preco, preco_promocional, promocao_ativa, franquia_cobrancas_mes, parent:parent_id(nome)")
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

          if (novoPlano.slug !== PLANO_ESSENCIAL) {
            await validarFranquiaPassageiros(usuarioId, franquiaContratada);
          }
      
          const anchorDate = assinaturaAtual.anchor_date || toLocalDateString(new Date());
          const vigenciaFim = assinaturaAtual.vigencia_fim || null;
      
          await supabaseAdmin
            .from("assinaturas_usuarios")
            .update({ ativo: false })
            .eq("id", assinaturaAtual.id);
      
          const statusNovo = (novoPlano.slug === PLANO_ESSENCIAL && assinaturaAtual.trial_end_at
              ? AssinaturaStatus.TRIAL
              : AssinaturaStatus.ATIVA);
      
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
      
          if (precoAplicado > 0) {
            const hojeDate = new Date();
            const vigenciaFimDate = assinaturaAtual.vigencia_fim ? new Date(assinaturaAtual.vigencia_fim) : hojeDate;
            const cobrancaDate = vigenciaFimDate > hojeDate ? vigenciaFimDate : hojeDate;
            const dataVencimentoCobranca = toLocalDateString(cobrancaDate);
      
            const { data: cobrancaNova, error: cobrancaError } = await supabaseAdmin
              .from("assinaturas_cobrancas")
              .insert({
                usuario_id: usuarioId,
                assinatura_usuario_id: novaAssinatura.id,
                valor: precoAplicado,
                status: AssinaturaCobrancaStatus.PENDENTE_PAGAMENTO,
                data_vencimento: dataVencimentoCobranca,
                billing_type: AssinaturaBillingType.DOWNGRADE,
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
                const provider = paymentService.getProvider();
                
                const txidToUse = crypto.createHash('md5').update(`${cobrancaNova.id}-${precoAplicado}`).digest('hex');
                const pixData = await provider.criarCobrancaImediata({
                  cobrancaId: txidToUse,
                  valor: precoAplicado,
                  cpf: onlyDigits(userPix.cpfcnpj),
                  nome: userPix.nome,
                });

      
                await supabaseAdmin
                  .from("assinaturas_cobrancas")
                  .update({
                    gateway_txid: pixData.gatewayTransactionId,
                    qr_code_payload: pixData.qrCodePayload,
                    location_url: pixData.location,
                  })
                  .eq("id", cobrancaNova.id);
              }
            } catch (pixErr: any) {
              logger.error({ err: pixErr.message }, "Erro ao gerar PIX no Downgrade");
            }
          }
      
          if (novoPlano.slug === PLANO_ESSENCIAL && (slugAtual === PLANO_PROFISSIONAL || (planoAtual.parent as any)?.slug === PLANO_PROFISSIONAL)) {
            try {
              const desativados = await automationService.desativarAutomacaoTodosPassageiros(usuarioId);
              logger.info({ usuarioId, desativados }, "Automação de passageiros desativada devido ao downgrade para o plano Essencial");
            } catch (autoError: any) {
              logger.error({ usuarioId, error: autoError.message }, "Erro ao desativar automação de passageiros no downgrade");
            }
          }

          // --- LOG DE AUDITORIA ---
          historicoService.log({
              usuario_id: usuarioId,
              entidade_tipo: AtividadeEntidadeTipo.ASSINATURA,
              entidade_id: novaAssinatura.id,
              acao: AtividadeAcao.ASSINATURA_DOWNGRADE,
              descricao: `Downgrade realizado para o plano ${novoPlano.nome}.`,
              meta: { plano: novoPlano.slug, franquia: franquiaContratada }
          });
      
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
            .select("id, slug, nome, preco, preco_promocional, promocao_ativa, franquia_cobrancas_mes, parent_id, parent:parent_id(nome)")
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

          if (novoSubplanoId === assinaturaAtual.plano_id) {
            throw new Error("Você já possui este plano. Para renovar sua assinatura, utilize o botão 'Regularizar'.");
          }
      
          const novaFranquiaSub = pricingService.calcularPrecosEFranquia(novoSubplano).franquiaContratada;
          await validarFranquiaPassageiros(usuarioId, novaFranquiaSub);

          if (!estaNoProfissional) {
            // Reaproveitamento no Subplano (Upgrade Inicial)
            const { data: existingSub } = await supabaseAdmin
                .from("assinaturas_usuarios")
                .select("id")
                .eq("usuario_id", usuarioId)
                .eq("status", AssinaturaStatus.PENDENTE_PAGAMENTO)
                .eq("plano_id", novoSubplanoId)
                .maybeSingle();
            
            if (existingSub) {
                const { data: cobSub } = await supabaseAdmin
                    .from("assinaturas_cobrancas")
                    .select("id")
                    .eq("assinatura_usuario_id", existingSub.id)
                    .eq("status", AssinaturaCobrancaStatus.PENDENTE_PAGAMENTO)
                    .maybeSingle();
                
                if (cobSub) {
                    const res = await assinaturaCobrancaService.gerarPixParaCobranca(cobSub.id);
                    return { ...res, success: true };
                }
            }

            await limparAssinaturasPendentes(usuarioId);

            await cancelarCobrancaPendente(usuarioId);
      
            const { precoAplicado, precoOrigem, franquiaContratada } = pricingService.calcularPrecosEFranquia(novoSubplano);
      
            const anchorDate = assinaturaAtual.anchor_date || toLocalDateString(new Date());
            const vigenciaFim = assinaturaAtual.vigencia_fim || null;
      
            const { data: novaAssinatura, error: assinaturaError } = await supabaseAdmin
              .from("assinaturas_usuarios")
              .insert({
                usuario_id: usuarioId,
                plano_id: novoSubplano.id,
                franquia_contratada_cobrancas: franquiaContratada,
                ativo: false,
                status: AssinaturaStatus.PENDENTE_PAGAMENTO,

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
                status: AssinaturaCobrancaStatus.PENDENTE_PAGAMENTO,
                data_vencimento: toLocalDateString(hoje),
                billing_type: AssinaturaBillingType.UPGRADE_PLAN,
                descricao: `Upgrade de Plano: ${planoAtual.nome} → ${novoSubplano.nome}`,
              })
              .select()
              .single();
      
            if (cobrancaError) throw cobrancaError;
      
            await validarFranquiaPassageiros(usuarioId, franquiaContratada);
      
            const usuario = await getUsuarioData(usuarioId);
            const cpf = onlyDigits(usuario.cpfcnpj);
      
            const provider = paymentService.getProvider();
            
            const txidToUse = crypto.createHash('md5').update(`${cobranca.id}-${precoAplicado}`).digest('hex');
            const pixData = await provider.criarCobrancaImediata({
              cobrancaId: txidToUse,
              valor: precoAplicado,
              cpf,
              nome: usuario.nome,
            });
      
      
            await supabaseAdmin
              .from("assinaturas_cobrancas")
              .update({
                gateway_txid: pixData.gatewayTransactionId,
                qr_code_payload: pixData.qrCodePayload,
                location_url: pixData.location,
              })
              .eq("id", cobranca.id);
      
            // Notificar Motorista (Ativação via Subplano)
            try {
               if (usuario.telefone) {
                   await notificationService.notifyDriver(usuario.telefone, DRIVER_EVENT_ACTIVATION, {
                       nomeMotorista: usuario.nome,
                       nomePlano: (novoSubplano.parent as any)?.nome || novoSubplano.nome,
                       valor: precoAplicado,
                       dataVencimento: toLocalDateString(new Date()),
                       pixPayload: pixData.qrCodePayload
                   });
               }
            } catch (notifErr) {
               logger.error({ notifErr }, "Falha ao enviar notificação de ativação subplano");
            }

            return {
              qrCodePayload: pixData.qrCodePayload,
              location: pixData.location,
              gateway_txid: pixData.gatewayTransactionId,
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
      
          await validarFranquiaPassageiros(usuarioId, franquiaContratada);
      
          const anchorDate = assinaturaAtual.anchor_date || toLocalDateString(new Date());
          const vigenciaFim = assinaturaAtual.vigencia_fim || null;

          const isRestricted = assinaturaAtual.status === AssinaturaStatus.SUSPENSA || 
                               assinaturaAtual.status === AssinaturaStatus.CANCELADA;

          if (isRestricted) {
            throw new Error("Sua conta está suspensa ou cancelada. Regularize sua assinatura antes de alterar o limite de passageiros.");
          }

          if (diferenca > 0) {
            const valorFinalCobrar = diferenca;
            const bType = AssinaturaBillingType.EXPANSION;

            // Reaproveitamente em Expansão Profissional ou Reativação
            const { data: existingExp } = await supabaseAdmin
                .from("assinaturas_usuarios")
                .select("id")
                .eq("usuario_id", usuarioId)
                .eq("status", AssinaturaStatus.PENDENTE_PAGAMENTO)
                .eq("plano_id", novoSubplano.id)
                .eq("franquia_contratada_cobrancas", franquiaContratada)
                .maybeSingle();
            
            if (existingExp) {
                const { data: cobExp } = await supabaseAdmin
                    .from("assinaturas_cobrancas")
                    .select("id, valor")
                    .eq("assinatura_usuario_id", existingExp.id)
                    .eq("status", AssinaturaCobrancaStatus.PENDENTE_PAGAMENTO)
                    .maybeSingle();
                
                // Só reaproveita se o valor for o mesmo (importante se mudou de pro-rata pra reativação)
                if (cobExp && Number(cobExp.valor) === valorFinalCobrar) {
                    const res = await assinaturaCobrancaService.gerarPixParaCobranca(cobExp.id);
                    return { ...res, success: true };
                }
            }

            await limparAssinaturasPendentes(usuarioId);

            await cancelarCobrancaPendente(usuarioId);
      
            const { data: novaAssinatura, error: assinaturaError } = await supabaseAdmin
              .from("assinaturas_usuarios")
              .insert({
                usuario_id: usuarioId,
                plano_id: novoSubplano.id,
                franquia_contratada_cobrancas: franquiaContratada,
                ativo: false,
                status: AssinaturaStatus.PENDENTE_PAGAMENTO,

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
                valor: valorFinalCobrar,
                status: AssinaturaCobrancaStatus.PENDENTE_PAGAMENTO,
                data_vencimento: toLocalDateString(new Date()),
                billing_type: bType,
                descricao: `Expansão de Limite: ${assinaturaAtual.franquia_contratada_cobrancas} → ${franquiaContratada} passageiros`,
              })
              .select()
              .single();
      
            if (cobrancaError) throw cobrancaError;
      
            const usuario = await getUsuarioData(usuarioId);
            const cpf = onlyDigits(usuario.cpfcnpj);
      
            const provider = paymentService.getProvider();
            
            const txidToUse = crypto.createHash('md5').update(`${cobranca.id}-${valorFinalCobrar}`).digest('hex');
            const pixData = await provider.criarCobrancaImediata({
              cobrancaId: txidToUse,
              valor: valorFinalCobrar,
              cpf,
              nome: usuario.nome,
            });
      
      
            await supabaseAdmin
              .from("assinaturas_cobrancas")
              .update({
                gateway_txid: pixData.gatewayTransactionId,
                qr_code_payload: pixData.qrCodePayload,
                location_url: pixData.location,
              })
              .eq("id", cobranca.id);
      
            // Notificar Motorista
            try {
               if (usuario.telefone) {
                   await notificationService.notifyDriver(usuario.telefone, DRIVER_EVENT_UPGRADE, {
                       nomeMotorista: usuario.nome,
                       nomePlano: (novoSubplano.parent as any)?.nome || novoSubplano.nome,
                       valor: valorFinalCobrar,
                       dataVencimento: toLocalDateString(new Date()),
                       pixPayload: pixData.qrCodePayload
                   });
               }
            } catch (notifErr) {
               logger.error({ notifErr }, "Falha ao enviar notificação de subplano");
            }

            // --- LOG DE AUDITORIA ---
            historicoService.log({
                usuario_id: usuarioId,
                entidade_tipo: AtividadeEntidadeTipo.ASSINATURA,
                entidade_id: novaAssinatura.id,
                acao: AtividadeAcao.ASSINATURA_UPGRADE,
                descricao: `Alteração de limite Profissional: ${franquiaAtual} → ${franquiaContratada} passageiros.`,
                meta: { franquia: franquiaContratada, valor: diferenca }
            });

            return {
              qrCodePayload: pixData.qrCodePayload,
              location: pixData.location,
              gateway_txid: pixData.gatewayTransactionId,
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
                status: AssinaturaStatus.ATIVA,

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
      
      async regularizarAssinatura(usuarioId: string): Promise<TrocaSubplanoResult> {
        try {
            const assinaturaAtual = await getAssinaturaAtiva(usuarioId);
            if (!assinaturaAtual) throw new Error("Assinatura não encontrada.");

            const isRestricted = assinaturaAtual.status === AssinaturaStatus.SUSPENSA || 
                                 assinaturaAtual.status === AssinaturaStatus.CANCELADA;

            if (!isRestricted) {
                throw new Error("Sua assinatura já está ativa. Não é necessário regularizar agora.");
            }

            const planoId = assinaturaAtual.plano_id;
            const franquiaContratada = assinaturaAtual.franquia_contratada_cobrancas || 0;
            const precoAplicado = Number(assinaturaAtual.preco_aplicado || 0);
            const anchorDate = assinaturaAtual.anchor_date || toLocalDateString(new Date());

            await limparAssinaturasPendentes(usuarioId);
            await cancelarCobrancaPendente(usuarioId);

            const { data: novaAssinatura, error: assinaturaError } = await supabaseAdmin
              .from("assinaturas_usuarios")
              .insert({
                usuario_id: usuarioId,
                plano_id: planoId,
                franquia_contratada_cobrancas: franquiaContratada,
                ativo: false,
                status: AssinaturaStatus.PENDENTE_PAGAMENTO,
                preco_aplicado: precoAplicado,
                preco_origem: (assinaturaAtual as any).preco_origem,
                anchor_date: anchorDate,
                vigencia_fim: null,
              })
              .select()
              .single();

            if (assinaturaError) throw assinaturaError;

            const { data: cobranca, error: cobrancaError } = await supabaseAdmin
              .from("assinaturas_cobrancas")
              .insert({
                usuario_id: usuarioId,
                assinatura_usuario_id: novaAssinatura.id,
                valor: precoAplicado,
                status: AssinaturaCobrancaStatus.PENDENTE_PAGAMENTO,
                data_vencimento: toLocalDateString(new Date()),
                billing_type: AssinaturaBillingType.ACTIVATION,
                descricao: `Regularização de Assinatura: ${assinaturaAtual.planos?.nome || 'Plano Profissional'}`,
              })
              .select()
              .single();

            if (cobrancaError) throw cobrancaError;

            const usuario = await getUsuarioData(usuarioId);
            const provider = paymentService.getProvider();
            const txidToUse = crypto.createHash('md5').update(`${cobranca.id}-${precoAplicado}`).digest('hex');
            
            const pixData = await provider.criarCobrancaImediata({
              cobrancaId: txidToUse,
              valor: precoAplicado,
              cpf: onlyDigits(usuario.cpfcnpj || ""),
              nome: usuario.nome,
            });

            await supabaseAdmin
              .from("assinaturas_cobrancas")
              .update({
                gateway_txid: pixData.gatewayTransactionId,
                qr_code_payload: pixData.qrCodePayload,
                location_url: pixData.location,
              })
              .eq("id", cobranca.id);

            // LOG CORRETO (Sem UPGRADE falso)
            historicoService.log({
                usuario_id: usuarioId,
                entidade_tipo: AtividadeEntidadeTipo.ASSINATURA,
                entidade_id: novaAssinatura.id,
                acao: AtividadeAcao.ASSINATURA_PAGAMENTO,
                descricao: `Solicitação de regularização de assinatura profissional (${franquiaContratada} passageiros).`,
                meta: { valor: precoAplicado, franquia: franquiaContratada }
            });

            return {
              qrCodePayload: pixData.qrCodePayload,
              location: pixData.location,
              gateway_txid: pixData.gatewayTransactionId,
              cobrancaId: cobranca.id,
              success: true,
            };
        } catch (err: any) {
            logger.error({ error: err.message, usuarioId }, "Falha na regularização de assinatura.");
            throw err;
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
            .select("id, nome, parent:parent_id(nome)")
            .eq("slug", PLANO_PROFISSIONAL)
            .eq("tipo", "base")
            .single();

          const nomePlano = (planoProfissionalBase as any)?.parent?.nome || (planoProfissionalBase as any)?.nome;
      
          if (planoBaseError || !planoProfissionalBase) {
            throw new Error("Plano Profissional não encontrado.");
          }
      
          await validarFranquiaPassageiros(usuarioId, quantidade);
      
          const { data: subPersonalizadaExistente } = await supabaseAdmin
            .from("assinaturas_usuarios")
            .select("id")
            .eq("usuario_id", usuarioId)
            .eq("status", AssinaturaStatus.PENDENTE_PAGAMENTO)
            .eq("plano_id", planoProfissionalBase.id)
            .eq("franquia_contratada_cobrancas", quantidade)
            .maybeSingle();
          
          if (subPersonalizadaExistente) {
             const { data: cobPers } = await supabaseAdmin
                .from("assinaturas_cobrancas")
                .select("id")
                .eq("assinatura_usuario_id", subPersonalizadaExistente.id)
                .eq("status", AssinaturaCobrancaStatus.PENDENTE_PAGAMENTO)
                .maybeSingle();
             
             if (cobPers) {
                const res = await assinaturaCobrancaService.gerarPixParaCobranca(cobPers.id);
                return { ...res, success: true, quantidadePersonalizada: quantidade };
             }
          }

          await limparAssinaturasPendentes(usuarioId);

          await cancelarCobrancaPendente(usuarioId);
      
          const anchorDate = assinaturaAtual?.anchor_date || toLocalDateString(new Date());
          const vigenciaFim = assinaturaAtual?.vigencia_fim || null;
      
          const { data: novaAssinatura, error: assinaturaError } = await supabaseAdmin
            .from("assinaturas_usuarios")
            .insert({
              usuario_id: usuarioId,
              plano_id: planoProfissionalBase.id,
              franquia_contratada_cobrancas: quantidade,
              ativo: false,
              status: AssinaturaStatus.PENDENTE_PAGAMENTO,

              preco_aplicado: precoCalculado,
              preco_origem: "personalizado",
              anchor_date: anchorDate,
              vigencia_fim: vigenciaFim,
            })
            .select()
            .single();
      
          if (assinaturaError) throw assinaturaError;
          const billingType = assinaturaAtual ? AssinaturaBillingType.UPGRADE_PLAN : AssinaturaBillingType.SUBSCRIPTION;
          let valorCobranca = precoCalculado;
      
          const isRestricted = assinaturaAtual?.status === AssinaturaStatus.SUSPENSA || 
                               assinaturaAtual?.status === AssinaturaStatus.CANCELADA;

          if (assinaturaAtual && !isRestricted) {
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
          } else if (isRestricted) {
            valorCobranca = precoCalculado;
          }
      
          const hoje = new Date();
          const { data: cobranca, error: cobrancaError } = await supabaseAdmin
            .from("assinaturas_cobrancas")
            .insert({
              usuario_id: usuarioId,
              assinatura_usuario_id: novaAssinatura.id,
              valor: valorCobranca,
              status: AssinaturaCobrancaStatus.PENDENTE_PAGAMENTO,
              data_vencimento: toLocalDateString(new Date()),
              billing_type: billingType === AssinaturaBillingType.SUBSCRIPTION ? AssinaturaBillingType.ACTIVATION : AssinaturaBillingType.EXPANSION,
              descricao: billingType === AssinaturaBillingType.SUBSCRIPTION
                ? `Ativação de Plano Profissional (${quantidade} passageiros)`
                : `Expansão de Limite: ${assinaturaAtual!.franquia_contratada_cobrancas} → ${quantidade} passageiros`,
            })
            .select()
            .single();
      
          if (cobrancaError) throw cobrancaError;
      
          const usuario = await getUsuarioData(usuarioId);
          const cpf = onlyDigits(usuario.cpfcnpj);
      
          const provider = paymentService.getProvider();
          
          const txidToUse = crypto.createHash('md5').update(`${cobranca.id}-${valorCobranca}`).digest('hex');
          const pixData = await provider.criarCobrancaImediata({
            cobrancaId: txidToUse,
            valor: valorCobranca,
            cpf,
            nome: usuario.nome,
          });
      
      
          await supabaseAdmin
            .from("assinaturas_cobrancas")
            .update({
              gateway_txid: pixData.gatewayTransactionId,
              qr_code_payload: pixData.qrCodePayload,
              location_url: pixData.location,
            })
            .eq("id", cobranca.id);
      
            // Notificar Motorista (Personalizado)
            try {
               if (usuario.telefone) {
                   const eventType = billingType === AssinaturaBillingType.SUBSCRIPTION ? DRIVER_EVENT_ACTIVATION : DRIVER_EVENT_UPGRADE;
                   await notificationService.notifyDriver(usuario.telefone, eventType, {
                       nomeMotorista: usuario.nome,
                       nomePlano: nomePlano,
                       valor: valorCobranca,
                       dataVencimento: toLocalDateString(hoje),
                       pixPayload: pixData.qrCodePayload
                   });
               }
            } catch (notifErr) {
               logger.error({ notifErr }, "Falha ao enviar notificação de personalizado");
            }

            return {
              qrCodePayload: pixData.qrCodePayload,
              location: pixData.location,
              gateway_txid: pixData.gatewayTransactionId,
              cobrancaId: cobranca.id,
              success: true,
            };
      
        } catch (err: any) {
          logger.error({ error: err.message, usuarioId, quantidade }, "Falha ao criar assinatura personalizada.");
          throw new Error(err.message || "Erro desconhecido ao criar assinatura personalizada.");
        }
      }
};
