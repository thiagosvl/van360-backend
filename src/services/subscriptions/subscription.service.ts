import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";
import {
    SubscriptionStatus,
    SubscriptionInvoiceStatus,
    SubscriptionIdentifer,
    IndicacaoStatus,
    CheckoutPaymentMethod,
    ConfigKey,
    AtividadeAcao,
    AtividadeEntidadeTipo,
    PaymentProvider
} from "../../types/enums.js";
import { getConfig } from "../configuracao.service.js";
import { historicoService } from "../historico.service.js";
import { getNowBR, getEndOfDayBR, parseLocalDate, addDays, toPersistenceString } from "../../utils/date.utils.js";
import type { CreateInvoiceDTO } from "../../types/dtos/subscription.dto.js";
import { notificationService } from "../notifications/notification.service.js";
import { EVENTO_MOTORISTA_ASSINATURA_PAGO } from "../../config/constants.js";

type FaturaComJoins = {
    id: string;
    assinatura_id: string;
    usuario_id: string;
    valor: number | string;
    status: SubscriptionInvoiceStatus;
    assinaturas: {
        id: string;
        status: SubscriptionStatus;
        data_vencimento: string | null;
        trial_ends_at: string | null;
        planos: { id: string; nome: string; identificador: SubscriptionIdentifer; } | null;
    } | null;
    planos: { id: string; nome: string; identificador: SubscriptionIdentifer; } | null;
    usuarios: { nome: string; telefone: string; } | null;
};

export const subscriptionService = {

    /**
     * Busca a assinatura atual do motorista.
     * Se não existir, tenta criar um Trial inicial.
     */
    async getOrCreateSubscription(userId: string) {
        const { data, error } = await supabaseAdmin
            .from("assinaturas")
            .select("*, planos(*)")
            .eq("usuario_id", userId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            logger.error({ error, userId }, "[SubscriptionService] Erro ao buscar assinatura.");
            return null;
        }

        if (!data) {
            return this.createTrial(userId);
        }

        return data;
    },

    /**
     * Cria um Trial de 15 dias para novos usuários.
     */
    async createTrial(userId: string) {
        // Buscar plano mensal padrão para associar ao trial (Resiliente a nomes legados no banco)
        const { data: plano } = await supabaseAdmin
            .from("planos")
            .select("id")
            .eq("identificador", SubscriptionIdentifer.MONTHLY)
            .single();

        if (!plano) {
            logger.error({ identificador: SubscriptionIdentifer.MONTHLY }, "[SubscriptionService] Plano inicial não encontrado para criar Trial.");
            return null;
        }

        const trialEndsAt = getEndOfDayBR();
        trialEndsAt.setDate(trialEndsAt.getDate() + 15);

        const { data, error } = await supabaseAdmin
            .from("assinaturas")
            .insert({
                usuario_id: userId,
                plano_id: plano.id,
                status: SubscriptionStatus.TRIAL,
                trial_ends_at: getEndOfDayBR(addDays(getNowBR(), 15)).toISOString()
            })
            .select("*, planos(*)")
            .single();

        if (error) {
            logger.error({ error, userId }, "[SubscriptionService] Erro ao criar Trial.");
            return null;
        }

        logger.info({ userId, trialEndsAt }, "[SubscriptionService] Trial criado com sucesso.");

        await historicoService.log({
            usuario_id: userId,
            entidade_tipo: AtividadeEntidadeTipo.SAAS_ASSINATURA,
            entidade_id: data.id,
            acao: AtividadeAcao.SAAS_ASSINATURA_ATIVA,
            descricao: "Trial de 15 dias iniciado para novo usuário."
        });

        return data;
    },

    /**
     * Calcula o preço do plano considerando promoção de Fundador.
     */
    async calculatePrice(userId: string, planIdentificador: string): Promise<number> {
        const { data: plano } = await supabaseAdmin
            .from("planos")
            .select("*")
            .eq("identificador", planIdentificador)
            .single();

        if (!plano) throw new Error(`Plano '${planIdentificador}' não encontrado.`);

        const isPromotionActive = await getConfig(ConfigKey.SAAS_PROMOCAO_ATIVA, "false") === "true";

        if (isPromotionActive && plano.valor_promocional) {
            return Number(plano.valor_promocional);
        }

        return Number(plano.valor);
    },

    /**
     * Resgata um convite de indicação (Bônus para o indicador).
     */
    async claimReferral(userId: string, phone: string) {
        const cleanPhone = phone.replace(/\D/g, "");

        // 1. Verificar se o usuário está em Trial
        const { data: currentSub } = await supabaseAdmin
            .from("assinaturas")
            .select("status")
            .eq("usuario_id", userId)
            .single();

        if (currentSub?.status !== SubscriptionStatus.TRIAL) {
            throw new Error("O resgate de convite só é permitido durante o período de Trial.");
        }

        // 2. Verificar se já possui indicação
        const { data: existingRef } = await supabaseAdmin
            .from("indicacoes")
            .select("id")
            .eq("indicado_id", userId)
            .maybeSingle();

        if (existingRef) {
            throw new Error("Você já possui um indicador vinculado.");
        }

        // 3. Buscar indicador
        const { data: indicador } = await supabaseAdmin
            .from("usuarios")
            .select("id")
            .eq("telefone", cleanPhone)
            .neq("id", userId)
            .maybeSingle();

        if (!indicador) {
            throw new Error("Motorista não encontrado com esse número.");
        }

        return this.registerReferral(indicador.id, userId);
    },

    /**
     * Registra uma nova indicação.
     */
    async registerReferral(indicadorId: string, indicadoId: string): Promise<void> {
        const { error } = await supabaseAdmin
            .from("indicacoes")
            .insert({
                indicador_id: indicadorId,
                indicado_id: indicadoId,
                status: IndicacaoStatus.PENDING
            });

        if (error) {
            logger.error({ error, indicadorId, indicadoId }, "[SubscriptionService] Erro ao registrar indicação.");
            throw error;
        }
    },

    /**
     * Retorna o resumo de indicações de um usuário.
     */
    async getReferralSummary(userId: string) {
        const { data, error } = await supabaseAdmin
            .from("indicacoes")
            .select("status")
            .eq("indicador_id", userId);

        if (error) throw error;

        const total = data?.length || 0;
        const completed = data?.filter(i => i.status === IndicacaoStatus.COMPLETED).length || 0;
        const pending = data?.filter(i => i.status === IndicacaoStatus.PENDING).length || 0;

        return {
            total,
            completed,
            pending,
            referralCode: userId,
            referralLink: `https://van360.com.br/registro?ref=${userId}`
        };
    },

    /**
     * Lista todos os planos ativos.
     */
    async listPlans() {
        const { data: plans, error } = await supabaseAdmin
            .from("planos")
            .select("*")
            .eq("ativo", true)
            .order("valor", { ascending: true });

        if (error) throw error;
        return plans;
    },

    /**
     * Lista as faturas de um usuário.
     */
    async getInvoices(userId: string) {
        const { data: invoices, error } = await supabaseAdmin
            .from("assinatura_faturas")
            .select("*, assinaturas(planos(*))")
            .eq("usuario_id", userId)
            .order("created_at", { ascending: false });

        if (error) throw error;
        return invoices;
    },

    /**
     * Lista os métodos de pagamento de um usuário.
     */
    async listPaymentMethods(userId: string) {
        const { data: methods, error } = await supabaseAdmin
            .from("metodos_pagamento")
            .select("id, brand, last_4_digits, expire_month, expire_year, is_default, created_at")
            .eq("usuario_id", userId)
            .order("is_default", { ascending: false })
            .order("created_at", { ascending: false });

        if (error) throw error;
        return methods || [];
    },

    /**
     * Remove um método de pagamento de um usuário.
     */
    async deletePaymentMethod(userId: string, paymentMethodId: string) {
        // 1. Remover o método
        const { error } = await supabaseAdmin
            .from("metodos_pagamento")
            .delete()
            .eq("id", paymentMethodId)
            .eq("usuario_id", userId);

        if (error) throw error;

        // 2. Se era o preferencial da assinatura, limpar a referência
        await supabaseAdmin
            .from("assinaturas")
            .update({ metodo_pagamento_preferencial_id: null })
            .eq("usuario_id", userId)
            .eq("metodo_pagamento_preferencial_id", paymentMethodId);

        return true;
    },

    /**
     * Define um método de pagamento como padrão e atualiza a assinatura.
     */
    async updateDefaultPaymentMethod(userId: string, paymentMethodId: string): Promise<void> {
        // 1. Resetar todos para false
        await supabaseAdmin
            .from("metodos_pagamento")
            .update({ is_default: false })
            .eq("usuario_id", userId);

        // 2. Definir o escolhido como true
        const { error: updateError } = await supabaseAdmin
            .from("metodos_pagamento")
            .update({ is_default: true })
            .eq("id", paymentMethodId)
            .eq("usuario_id", userId);

        if (updateError) throw updateError;

        const { error: subError } = await supabaseAdmin
            .from("assinaturas")
            .update({
                metodo_pagamento_preferencial_id: paymentMethodId,
                metodo_pagamento: CheckoutPaymentMethod.CREDIT_CARD,
                updated_at: getNowBR().toISOString()
            })
            .eq("usuario_id", userId);

        if (subError) throw subError;
    },

    /**
     * Conclui uma indicação e aplica o bônus de 1 mês grátis ao indicador.
     */
    async completeReferral(indicadoId: string, faturaId: string) {
        const { data: indicacao, error } = await supabaseAdmin
            .from("indicacoes")
            .select("*")
            .eq("indicado_id", indicadoId)
            .eq("status", IndicacaoStatus.PENDING)
            .single();

        if (error || !indicacao) return;

        // 1. Atualizar status da indicação
        await supabaseAdmin
            .from("indicacoes")
            .update({ status: IndicacaoStatus.COMPLETED, fatura_origem_id: faturaId })
            .eq("id", indicacao.id);

        // 2. Aplicar bônus ao indicador (Adicionar 30 dias à validade da assinatura atual)
        const sub = await this.getOrCreateSubscription(indicacao.indicador_id);
        if (sub) {
            const newExpiry = sub.data_vencimento ? parseLocalDate(sub.data_vencimento) : getNowBR();
            newExpiry.setDate(newExpiry.getDate() + 30);

            await supabaseAdmin
                .from("assinaturas")
                .update({
                    data_vencimento: getEndOfDayBR(newExpiry).toISOString(),
                    status: SubscriptionStatus.ACTIVE
                })
                .eq("id", sub.id);

            logger.info({ indicadorId: indicacao.indicador_id, meses: 1 }, "[SubscriptionService] Bônus de indicação aplicado.");
        }
    },

    /**
     * Verifica se o motorista está bloqueado.
     */
    async isBlocked(userId: string): Promise<boolean> {
        const sub = await this.getOrCreateSubscription(userId);
        if (!sub) return true;

        if (sub.status === SubscriptionStatus.EXPIRED) return true;

        // Se for trial, verificar se já expirou
        if (sub.status === SubscriptionStatus.TRIAL) {
            const trialLimit = parseLocalDate(sub.trial_ends_at);
            return trialLimit < getNowBR();
        }

        return false;
    },

    /**
     * Atualiza o status e registra o motivo (opcional).
     */
    async updateStatus(id: string, status: SubscriptionStatus, motivo?: string) {
        logger.info({ subId: id, status, motivo }, "[SubscriptionService] Atualizando status de assinatura...");

        const { error } = await supabaseAdmin
            .from("assinaturas")
            .update({ status, updated_at: getNowBR().toISOString() })
            .eq("id", id);

        if (error) {
            logger.error({ error, subId: id }, "[SubscriptionService] Erro ao atualizar status.");
            throw error;
        }

        return true;
    },

    /**
     * Ativa a assinatura com base no pagamento de uma fatura.
     */
    async activateByFatura(faturaId: string) {
        // 1. Buscar fatura e plano (Usando o plano vinculado à FATURA para garantir consistência)
        const { data: rawFatura, error: fError } = await supabaseAdmin
            .from("assinatura_faturas")
            .select("*, assinaturas(*), planos(*), usuarios(nome, telefone)")
            .eq("id", faturaId)
            .single();

        if (fError || !rawFatura) {
            logger.error({ error: fError, faturaId }, "[SubscriptionService] Fatura não encontrada para ativação.");
            return;
        }

        const fatura = rawFatura as unknown as FaturaComJoins;

        if (fatura.status !== SubscriptionInvoiceStatus.PENDING) {
            logger.info({ faturaId, status: fatura.status }, "[SubscriptionService] Webhook ignorado: Fatura já processada.");
            return;
        }

        await supabaseAdmin
            .from("assinatura_faturas")
            .update({
                status: SubscriptionInvoiceStatus.PAID,
                data_pagamento: getNowBR().toISOString(),
                updated_at: getNowBR().toISOString()
            })
            .eq("id", faturaId);

        const sub = fatura.assinaturas;
        const plano = fatura.planos ?? sub?.planos;

        if (!sub || !plano) {
            logger.error({ faturaId }, "[SubscriptionService] Fatura sem assinatura ou plano vinculado.");
            return;
        }

        const now = getNowBR();
        let baseDate = now;
        const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

        if (sub.data_vencimento && (sub.status === SubscriptionStatus.ACTIVE || sub.status === SubscriptionStatus.PAST_DUE)) {
            baseDate = parseLocalDate(sub.data_vencimento);
            if (baseDate.getTime() < now.getTime() - THIRTY_DAYS_MS) {
                baseDate = now;
            }
        } else if (sub.status === SubscriptionStatus.TRIAL && sub.trial_ends_at) {
            const trialLimit = parseLocalDate(sub.trial_ends_at);
            if (trialLimit > now) {
                baseDate = trialLimit;
            }
        }

        let newExpiry = getEndOfDayBR(baseDate);
        if (plano.identificador === SubscriptionIdentifer.YEARLY) {
            newExpiry.setFullYear(newExpiry.getFullYear() + 1);
        } else {
            newExpiry.setMonth(newExpiry.getMonth() + 1);
        }

        await supabaseAdmin
            .from("assinaturas")
            .update({
                status: SubscriptionStatus.ACTIVE,
                plano_id: plano.id,
                data_vencimento: getEndOfDayBR(newExpiry).toISOString(),
                trial_ends_at: null,
                updated_at: getNowBR().toISOString()
            })

            .eq("id", fatura.assinatura_id);

        logger.info({
            faturaId,
            planoNome: plano.nome,
            newExpiry
        }, "[SubscriptionService] Assinatura ATIVADA/RENOVADA com sucesso.");

        // Registrar Histórico
        await historicoService.log({
            usuario_id: fatura.usuario_id,
            entidade_tipo: AtividadeEntidadeTipo.SAAS_FATURA,
            entidade_id: fatura.id,
            acao: AtividadeAcao.SAAS_PAGAMENTO_RECEBIDO,
            descricao: `Pagamento confirmado para fatura ${fatura.id.split("-")[0]} (Valor R$ ${fatura.valor})`
        });

        await historicoService.log({
            usuario_id: fatura.usuario_id,
            entidade_tipo: AtividadeEntidadeTipo.SAAS_ASSINATURA,
            entidade_id: fatura.assinatura_id,
            acao: AtividadeAcao.SAAS_ASSINATURA_ATIVA,
            descricao: `Assinatura ativada via plano ${plano.nome} até ${newExpiry.toLocaleDateString("pt-BR")}`
        });

        await this.completeReferral(fatura.usuario_id, fatura.id);

        const user = fatura.usuarios;
        if (user?.telefone) {
            notificationService.notifyDriver(user.telefone, EVENTO_MOTORISTA_ASSINATURA_PAGO, {
                nomeMotorista: user.nome,
                valor: typeof fatura.valor === "string" ? parseFloat(fatura.valor) : fatura.valor,
                dataVencimento: getEndOfDayBR(newExpiry).toISOString(),
            }).catch(err => logger.error({ err }, "[SubscriptionService] Falha ao notificar pagamento confirmado"));
        }
    },

    /**
     * Cria uma nova fatura para renovação ou início de assinatura.
     */
    async createInvoice(userId: string, requestData: CreateInvoiceDTO) {
        const {
            planId, paymentMethod, paymentToken, savedCardId, saveCard, cardBrand, cardLast4, expireMonth, expireYear,
            birth, street, number, neighborhood, zipcode, city, state
        } = requestData;

        const [userRes, planRes] = await Promise.all([
            supabaseAdmin.from("usuarios").select("*").eq("id", userId).single(),
            supabaseAdmin.from("planos").select("*").eq("id", planId).single()
        ]);

        if (userRes.error || !userRes.data) throw new Error("Usuário não encontrado.");
        if (planRes.error || !planRes.data) throw new Error("Plano não encontrado.");

        const user = userRes.data;
        const plano = planRes.data;
        const valor = await this.calculatePrice(userId, plano.identificador);

        const sub = await this.getOrCreateSubscription(userId);
        if (!sub) throw new Error("Erro ao obter assinatura.");

        let currentPaymentToken = paymentToken;
        let preferredMethodId: string | null = sub.metodo_pagamento_preferencial_id;

        if (paymentMethod === CheckoutPaymentMethod.CREDIT_CARD) {
            // Cartão salvo selecionado pelo usuário ou padrão da assinatura
            const cardIdToUse = savedCardId || preferredMethodId;

            if (!currentPaymentToken && cardIdToUse) {
                const { data: savedCard } = await supabaseAdmin
                    .from("metodos_pagamento")
                    .select("*")
                    .eq("id", cardIdToUse)
                    .eq("usuario_id", userId)
                    .single();
                if (savedCard) {
                    currentPaymentToken = savedCard.payment_token;
                    preferredMethodId = savedCard.id;
                }
            }

            if (!currentPaymentToken) {
                throw new Error("Token de pagamento não fornecido ou método salvo não encontrado.");
            }

            await supabaseAdmin
                .from("assinaturas")
                .update({
                    metodo_pagamento_preferencial_id: preferredMethodId,
                    metodo_pagamento: CheckoutPaymentMethod.CREDIT_CARD,
                    updated_at: getNowBR().toISOString()
                })
                .eq("id", sub.id);
        } else {
            await supabaseAdmin
                .from("assinaturas")
                .update({
                    metodo_pagamento: CheckoutPaymentMethod.PIX,
                    updated_at: getNowBR().toISOString()
                })
                .eq("id", sub.id);
        }

        // Limpeza de faturas pendentes anteriores
        await supabaseAdmin
            .from("assinatura_faturas")
            .update({
                status: SubscriptionInvoiceStatus.CANCELED,
                updated_at: getNowBR().toISOString()
            })
            .eq("usuario_id", userId)
            .eq("status", SubscriptionInvoiceStatus.PENDING);

        const { paymentService } = await import("../payments/payment.service.js");

        const chargeRes = await paymentService.createCharge({
            amount: valor,
            description: `Assinatura Van360 - Plano ${plano.nome}`,
            dueDate: toPersistenceString(addDays(getNowBR(), 1)),
            externalId: `sub_${sub.id}_${Date.now()}`,
            paymentMethod: paymentMethod,
            paymentToken: currentPaymentToken,
            customer: {
                name: user.nome,
                document: user.cpfcnpj,
                email: user.email || "financeiro@van360.com.br",
                phone: user.telefone || "11999999999",
                birth: birth || "1980-01-01"
            },
            billingAddress: (paymentMethod === CheckoutPaymentMethod.CREDIT_CARD && street) ? {
                street: street,
                number: number || "SN",
                neighborhood: neighborhood || "Centro",
                zipcode: zipcode?.replace(/\D/g, "") || "01001000",
                city: city || "São Paulo",
                state: state || "SP"
            } : undefined
        }, PaymentProvider.EFIPAY);

        if (!chargeRes.success) {
            logger.error({ userId, error: chargeRes.error }, "[SubscriptionService] Erro ao gerar Cobrança no Gateway");
            throw new Error(`Erro no Gateway de Pagamento: ${chargeRes.error}`);
        }

        // Salva/atualiza cartão apenas após cobrança aprovada pelo gateway
        if (paymentMethod === CheckoutPaymentMethod.CREDIT_CARD && currentPaymentToken && saveCard && cardLast4 && cardBrand) {
            const { data: existingCard } = await supabaseAdmin
                .from("metodos_pagamento")
                .select("id")
                .eq("usuario_id", userId)
                .eq("brand", cardBrand)
                .eq("last_4_digits", cardLast4)
                .eq("expire_month", expireMonth ?? "")
                .eq("expire_year", expireYear ?? "")
                .maybeSingle();

            await supabaseAdmin.from("metodos_pagamento").update({ is_default: false }).eq("usuario_id", userId);

            if (existingCard) {
                await supabaseAdmin
                    .from("metodos_pagamento")
                    .update({ payment_token: currentPaymentToken, is_default: true })
                    .eq("id", existingCard.id);
                preferredMethodId = existingCard.id;
            } else {
                const { data: newMethod } = await supabaseAdmin
                    .from("metodos_pagamento")
                    .insert({
                        usuario_id: userId,
                        brand: cardBrand,
                        last_4_digits: cardLast4,
                        expire_month: expireMonth,
                        expire_year: expireYear,
                        payment_token: currentPaymentToken,
                        is_default: true
                    })
                    .select("id")
                    .single();
                if (newMethod) preferredMethodId = newMethod.id;
            }

            if (preferredMethodId) {
                await supabaseAdmin
                    .from("assinaturas")
                    .update({ metodo_pagamento_preferencial_id: preferredMethodId })
                    .eq("id", sub.id);
            }
        }

        const { data: fatura, error: fError } = await supabaseAdmin
            .from("assinatura_faturas")
            .insert({
                usuario_id: userId,
                assinatura_id: sub.id,
                plano_id: planId,
                metodo_pagamento: paymentMethod, // SALVA O MÉTODO UTILIZADO NA FATURA
                valor,
                status: SubscriptionInvoiceStatus.PENDING,
                data_vencimento: toPersistenceString(addDays(getNowBR(), 1)),
                gateway_txid: chargeRes.providerId,
                pix_copy_paste: chargeRes.pixCopyPaste
            })
            .select()
            .single();

        if (fError) throw fError;

        await historicoService.log({
            usuario_id: userId,
            entidade_tipo: AtividadeEntidadeTipo.SAAS_FATURA,
            entidade_id: fatura.id,
            acao: AtividadeAcao.SAAS_FATURA_GERADA,
            descricao: `Nova fatura gerada via ${paymentMethod.toUpperCase()} (Valor R$ ${valor})`
        });

        return fatura;
    }
};
