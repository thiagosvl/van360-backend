import { formatToBrazilianDate } from "../../../utils/date.utils.js";
import { formatCurrency, getFirstName } from "../../../utils/format.js";
import { CompositeMessagePart } from "../../../types/dtos/whatsapp.dto.js";

/**
 * Templates de Mensagem para Motoristas / Assinantes do Sistema
 */

export interface DriverContext {
    nomeMotorista: string;
    valor?: number;
    dataVencimento?: string;
    pixCopiaECola?: string;
    metodoCobranca?: string;
    cardLast4?: string;
    mes?: number;
    ano?: number;
    reciboUrl?: string;
    nomePassageiro?: string;
    nomeResponsavel?: string;
    trialDays?: number;
    contratoUrl?: string;
    otpCode?: string;
    erro?: string;
    valorPromocional?: number;
    isEngaged?: boolean;
}

const textPart = (text: string): CompositeMessagePart[] => {
    return [{ type: "text", content: text }];
};

export const DriverTemplates = {

    /**
     * Boas-vindas: Onboarding concluído (Trial Iniciado)
     */
    welcomeTrial: (ctx: DriverContext): CompositeMessagePart[] => {
        const validade = ctx.dataVencimento ? formatToBrazilianDate(ctx.dataVencimento) : "15 dias";
        return textPart(`🚀 *Bem-vindo(a) à Van360, ${getFirstName(ctx.nomeMotorista)}!*\n\n` +
            `Sua conta está ativa e você tem acesso completo *gratuitamente até ${validade}*.\n\n` +
            `Explore sem pressa: cadastre seus passageiros, controle as mensalidades e muito mais.\n\n` +
            `Qualquer dúvida, é só chamar aqui. 😊`);
    },

    /**
     * Trial Expirando (Aviso prévio)
     */
    trialExpiring: (ctx: DriverContext): CompositeMessagePart[] => {
        const dias = ctx.trialDays ?? "alguns";
        const validade = ctx.dataVencimento ? formatToBrazilianDate(ctx.dataVencimento) : "";
        const dataStr = validade ? ` (${validade})` : "";
        return textPart(`⏳ *Seu período de teste está acabando*\n\n` +
            `Olá *${getFirstName(ctx.nomeMotorista)}*,\n\n` +
            `Seu acesso gratuito ao Van360 encerra em *${dias} ${dias === 1 ? "dia" : "dias"}*${dataStr}.\n\n` +
            `Para continuar usando o sistema sem interrupções, assine seu plano.\n` +
            `Se tiver qualquer dúvida, estamos aqui. 👋`);
    },

    /**
     * Trial Encerrado (já expirou)
     */
    trialEnded: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`😔 *Período gratuito encerrado*\n\n` +
            `Olá *${getFirstName(ctx.nomeMotorista)}*,\n\n` +
            `Seu acesso gratuito ao Van360 chegou ao fim, mas seus dados estão todos preservados.\n\n` +
            `Para reativar e continuar gerindo sua van sem interrupções, assine seu plano.\n\n` +
            `Te esperamos de volta! 🚐`);
    },

    /**
     * Trial D+7 — Usuário engajado (tem passageiros cadastrados)
     */
    trialMidpointEngaged: (ctx: DriverContext): CompositeMessagePart[] => {
        const dias = ctx.trialDays ?? 8;
        return textPart(`👏 *Olá, ${getFirstName(ctx.nomeMotorista)}!*\n\n` +
            `Você está aproveitando bem o Van360. Que ótimo!\n\n` +
            `Ainda faltam *${dias} dias* do seu acesso gratuito. Para continuar sem perder nada, assine seu plano antes que o período encerre.\n\n` +
            `Qualquer dúvida, é só chamar. 😊`);
    },

    /**
     * Trial D+7 — Usuário inativo (ainda não cadastrou passageiros)
     */
    trialMidpointInactive: (ctx: DriverContext): CompositeMessagePart[] => {
        const dias = ctx.trialDays ?? 8;
        return textPart(`👋 *Oi, ${getFirstName(ctx.nomeMotorista)}!*\n\n` +
            `Notamos que você ainda não começou a usar o Van360. O dia a dia é corrido, entendemos!\n\n` +
            `Você ainda tem *${dias} dias gratuitos* para explorar — abra o app e comece cadastrando seus passageiros. Vale muito a pena!\n\n` +
            `Se precisar de ajuda para dar o primeiro passo, é só responder essa mensagem. 😊`);
    },

    /**
     * Trial D+14 — Último aviso antes do encerramento
     */
    trialLastCall: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`⚠️ *${getFirstName(ctx.nomeMotorista)}, amanhã é o último dia!*\n\n` +
            `Seu período gratuito na Van360 encerra *amanhã*.\n\n` +
            `Para continuar sem interrupção, assine seu plano agora e mantenha tudo funcionando.\n\n` +
            `Não deixa pra última hora! 🚀`);
    },

    /**
     * Trial — Hoje é o último dia (Dia 0)
     */
    trialToday: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`🚨 *ÚLTIMO DIA! Sua conta expira hoje.*\n\n` +
            `Olá *${getFirstName(ctx.nomeMotorista)}*,\n\n` +
            `Seu acesso gratuito ao Van360 termina *hoje*.\n\n` +
            `Não perca o controle da sua van: assine seu plano agora e continue usando normalmente.\n\n` +
            `Estamos à disposição para ajudar. 😊`);
    },

    /**
     * Trial Recuperação 1 — D+16 após expirar
     */
    trialRecovery1: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`😔 *Sentimos sua falta, ${getFirstName(ctx.nomeMotorista)}!*\n\n` +
            `Seu acesso ao Van360 expirou. Se surgiu algum imprevisto ou ficou alguma dúvida, estamos aqui.\n\n` +
            `Quando quiser reativar, seus dados estão todos preservados. É só assinar seu plano.`);
    },

    /**
     * Trial Recuperação 2 — D+20 (com oferta promocional se ativa)
     */
    trialRecovery2: (ctx: DriverContext): CompositeMessagePart[] => {
        const promoStr = ctx.valorPromocional
            ? `\n\n🎁 *Oferta especial:* assine por apenas *R$ ${ctx.valorPromocional.toFixed(2).replace('.', ',')}/mês* por tempo limitado.`
            : "";
        return textPart(`🎯 *${getFirstName(ctx.nomeMotorista)}, ainda dá tempo!*\n\n` +
            `Sua conta Van360 está suspensa, mas a reativação é imediata e seus dados continuam lá.${promoStr}\n\n` +
            `Assine seu plano e volte a usar sem perder nada.`);
    },

    /**
     * Trial Recuperação Final — D+25
     */
    trialRecoveryFinal: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`${getFirstName(ctx.nomeMotorista)}, última tentativa de contato.\n\n` +
            `Se decidir voltar ao Van360, sua conta está preservada e a reativação é imediata.\n\n` +
            `Boa sorte e sucesso na sua van! 🚐`);
    },

    /**
     * Renovação — D+1 PAST_DUE (lembrete)
     */
    renewalLembrete: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = ctx.valor ? formatCurrency(ctx.valor) : "";
        const valorStr = valor ? ` de *${valor}*` : "";
        const isCard = ctx.metodoCobranca === "credit_card";
        const extra = isCard
            ? `\n\n💳 A cobrança automática no seu cartão não foi processada. Entre no app para atualizar o cartão ou realizar o pagamento via Pix.`
            : ctx.pixCopiaECola
                ? `\n\n💳 *Pague agora com Pix:*\n${ctx.pixCopiaECola}\n\n_Copie o código acima e pague no seu banco._`
                : `\n\nRegularize sua assinatura para não perder o acesso.`;
        return textPart(`🔔 *${getFirstName(ctx.nomeMotorista)}, lembrete de pagamento*\n\n` +
            `Sua assinatura Van360${valorStr} está com pagamento em aberto desde ontem.${extra}`);
    },

    /**
     * Renovação — D+2 PAST_DUE (urgência — expira amanhã)
     */
    renewalUrgencia: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = ctx.valor ? formatCurrency(ctx.valor) : "";
        const valorStr = valor ? ` (*${valor}*)` : "";
        const isCard = ctx.metodoCobranca === "credit_card";
        const extra = isCard
            ? `\n\n⚠️ Entre no app, atualize seu cartão ou pague via Pix antes que o acesso seja suspenso amanhã.`
            : ctx.pixCopiaECola
                ? `\n\n💳 *Pague agora com Pix:*\n${ctx.pixCopiaECola}\n\n_Copie o código acima e pague no seu banco._`
                : `\n\nRegularize sua assinatura agora para não perder o acesso.`;
        return textPart(`🚨 *URGENTE — ${getFirstName(ctx.nomeMotorista)}!*\n\n` +
            `Sua assinatura Van360${valorStr} será *suspensa amanhã* se o pagamento não for confirmado.${extra}\n\n` +
            `Evite a interrupção! ⚠️`);
    },

    /**
     * Recuperação — D+5 após EXPIRED (assinante que já pagou)
     */
    renewalRecovery1: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`😔 *${getFirstName(ctx.nomeMotorista)}, sua assinatura está suspensa.*\n\n` +
            `Sabemos que imprevistos acontecem. Para reativar e voltar ao acesso completo, renove sua assinatura.\n\n` +
            `Seus dados estão todos preservados. 👍`);
    },

    /**
     * Recuperação Final — D+10 após EXPIRED (assinante que já pagou)
     */
    renewalRecoveryFinal: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`${getFirstName(ctx.nomeMotorista)}, última tentativa.\n\n` +
            `Sua conta Van360 continua preservada. Quando quiser reativar, estamos aqui.\n\n` +
            `Estamos aqui quando precisar. 🚐`);
    },

    /**
     * Confirmação de pagamento (Pagamento Confirmado)
     */
    paymentConfirmed: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = ctx.valor ? formatCurrency(ctx.valor) : "";
        const data = ctx.dataVencimento ? formatToBrazilianDate(ctx.dataVencimento) : "";

        return textPart(`✅ *Parabéns pela Assinatura!*\n\n` +
            (valor ? `Pagamento de *${valor}* confirmado.\n` : `Pagamento confirmado.\n`) +
            `Seu acesso agora é ilimitado. Obrigado por confiar no Van360!` +
            (data ? `\n\n📅 Próximo vencimento: *${data}*` : ""));
    },

    /**
     * Assinatura Venceu (transição para PAST_DUE)
     */
    dueToday: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = ctx.valor ? formatCurrency(ctx.valor) : "";
        const valorStr = valor ? ` no valor de *${valor}*` : "";
        return textPart(`⚠️ *Assinatura Venceu*\n\n` +
            `O pagamento da sua assinatura Van360${valorStr} venceu hoje.\n` +
            `Regularize para evitar a suspensão do acesso.`);
    },

    /**
     * Assinatura Vencendo em breve — PIX gerado (lembrete antecipado)
     */
    dueSoon: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = ctx.valor ? formatCurrency(ctx.valor) : "";
        const data = ctx.dataVencimento ? formatToBrazilianDate(ctx.dataVencimento) : "";
        const valorStr = valor ? ` (*${valor}*)` : "";
        const dataStr = data ? ` em *${data}*` : " em breve";
        const pixExtra = ctx.pixCopiaECola
            ? `\n\n💵 *Pix Copia e Cola:*\n${ctx.pixCopiaECola}\n\n_Copie o código acima e pague no seu banco._`
            : "";

        return textPart(`🗓️ *Lembrete de Assinatura*\n\n` +
            `Sua assinatura Van360${valorStr} vence${dataStr}.\n` +
            `Mantenha sua conta em dia para não interromper suas cobranças.${pixExtra}`);
    },

    /**
     * Assinatura Expirada (transição para EXPIRED após carência)
     */
    overdue: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = ctx.valor ? formatCurrency(ctx.valor) : "";
        const valorStr = valor ? ` de *${valor}*` : "";
        return textPart(`🚨 *Acesso Suspenso*\n\n` +
            `Sua assinatura Van360${valorStr} foi suspensa por falta de pagamento.\n` +
            `Para voltar a usar o sistema, renove sua assinatura.`);
    },

    /**
     * Contrato Assinado (Pelo Passageiro/Responsável)
     */
    contractSigned: (ctx: DriverContext): CompositeMessagePart[] => {
        const nomePas = getFirstName(ctx.nomePassageiro) || "passageiro";
        const nomeResp = ctx.nomeResponsavel ? ` (${getFirstName(ctx.nomeResponsavel)})` : "";
        const linkStr = ctx.contratoUrl ? `\n\n📄 Veja o documento final:\n${ctx.contratoUrl}` : "";
        return textPart(`✍️ *Contrato Assinado*\n\n` +
            `Ótimas notícias! O contrato de *${nomePas}*${nomeResp} acaba de ser assinado digitalmente.${linkStr}\n\n` +
            `O documento também está disponível no seu painel de gestão.`);
    },

    /**
     * Recuperação de Senha (OTP)
     */
    authRecovery: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`🔐 *Recuperação de Acesso*\n\n` +
            `Olá *${getFirstName(ctx.nomeMotorista)}*,\n` +
            `Você solicitou a recuperação da sua senha na *Van360*.\n\n` +
            `Seu código de verificação é:\n` +
            `👉 *${ctx.otpCode}*\n\n` +
            `O código expira em 15 minutos.\n` +
            `Se não foi você quem solicitou, ignore esta mensagem por segurança.`);
    },

    /**
     * Confirmação de Senha Alterada
     */
    passwordChanged: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`✅ *Senha Alterada com Sucesso*\n\n` +
            `Olá *${getFirstName(ctx.nomeMotorista)}*,\n` +
            `A senha da sua conta na *Van360* foi alterada com sucesso.\n\n` +
            `🛑 *Não foi você?*\n` +
            `Caso não tenha sido você quem realizou essa alteração, entre em contato imediatamente com o nosso suporte.`);
    },

    /**
     * Aviso antecipado de cobrança automática no cartão
     */
    cardChargeNotice: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = ctx.valor ? formatCurrency(ctx.valor) : "";
        const cardStr = ctx.cardLast4 ? ` final *${ctx.cardLast4}*` : "";
        const dataStr = ctx.dataVencimento ? ` em *${formatToBrazilianDate(ctx.dataVencimento)}*` : " em breve";
        return textPart(`🔄 *Aviso de Renovação Automática*\n\n` +
            `Olá *${getFirstName(ctx.nomeMotorista)}*,\n\n` +
            `Sua assinatura Van360 será renovada automaticamente${dataStr}.\n` +
            (valor ? `O valor de *${valor}* será debitado no cartão${cardStr}.\n\n` : ``) +
            `Caso queira alterar o cartão ou realizar o pagamento via Pix, acesse o app antes dessa data.`);
    },

    /**
     * Falha na cobrança automática do cartão
     */
    failedCC: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = ctx.valor ? formatCurrency(ctx.valor) : "";
        const valorStr = valor ? ` no valor de *${valor}*` : "";
        return textPart(`❌ *Falha na Renovação Automática*\n\n` +
            `Olá *${getFirstName(ctx.nomeMotorista)}*,\n\n` +
            `Tivemos um problema ao processar o pagamento da sua assinatura${valorStr} via cartão de crédito.\n\n` +
            `Entre no app para atualizar seu cartão ou realizar o pagamento via Pix e manter sua conta ativa.`);
    }
};
