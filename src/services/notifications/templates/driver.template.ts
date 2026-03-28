import { formatToBrazilianDate, getMonthNameBR, toLocalDateString } from "../../../utils/date.utils.js";
import { formatCurrency, getFirstName } from "../../../utils/format.js";
import { CompositeMessagePart } from "../../../types/dtos/whatsapp.dto.js";

/**
 * Templates de Mensagem para Motoristas / Assinantes do Sistema
 */

export interface DriverContext {
    nomeMotorista: string;
    valor?: number;
    dataVencimento?: string;
    mes?: number;
    ano?: number;
    reciboUrl?: string;
    nomePassageiro?: string;
    nomeResponsavel?: string;
    trialDays?: number;
    contratoUrl?: string;
    otpCode?: string;
}

const textPart = (text: string): CompositeMessagePart[] => {
    return [{ type: "text", content: text }];
};

export const DriverTemplates = {

    /**
     * Boas-vindas: Onboarding concluído (Trial Iniciado)
     */
    welcomeTrial: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`🚀 *Bem-vindo(a) à Van360*\n\n` +
            `Sua conta foi criada com sucesso e seu período de teste (trial) foi iniciado.\n\n` +
            `⚠️ *Próximos Passos*\n` +
            `• Configurar seu contrato padrão\n` +
            `• Cadastrar seus primeiros passageiros`);
    },

    /**
     * Trial Expirando (Aviso prévio)
     */
    trialExpiring: (ctx: DriverContext): CompositeMessagePart[] => {
        const dias = ctx.trialDays || "poucos";
        return textPart(`⏳ *Seu Trial está acabando*\n\n` +
            `Olá *${getFirstName(ctx.nomeMotorista)}*,\n` +
            `Seu período de experiência na Van360 encerra em *${dias} dias*.\n\n` +
            `Não perca o acesso às automações! Efetue a contratação da assinatura para continuar gerindo sua van sem interrupções.`);
    },

    /**
     * Confirmação de contratação (Pagamento Confirmado)
     */
    paymentConfirmed: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor ?? 0);
        const data = ctx.dataVencimento ? formatToBrazilianDate(ctx.dataVencimento) : "";

        return textPart(`✅ *Parabéns pela Assinatura!*\n\n` +
            `Pagamento de *${valor}* confirmado.\n` +
            `Seu acesso agora é ilimitado e você saiu do modo trial. Obrigado por confiar na Van360!` +
            (data ? `\n\n📅 Próximo vencimento: *${data}*` : ""));
    },

    /**
     * Assinatura Vence Hoje (Venceu)
     */
    dueToday: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor ?? 0);
        return textPart(`⚠️ *Assinatura Vence Hoje*\n\n` +
            `O pagamento da sua assinatura Van360 no valor de *${valor}* vence hoje.\n` +
            `Regularize para evitar a suspensão das notificações automáticas.`);
    },

    /**
     * Assinatura Vencendo (Lembrete)
     */
    dueSoon: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor ?? 0);
        const data = ctx.dataVencimento ? formatToBrazilianDate(ctx.dataVencimento) : "";
        return textPart(`🗓️ *Lembrete de Assinatura*\n\n` +
            `Sua assinatura Van360 (*${valor}*) vence em *${data}*.\n` +
            `Mantenha sua conta em dia para não parar suas cobranças.`);
    },

    /**
     * Assinatura Expirada (Atrasada)
     */
    overdue: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor ?? 0);
        return textPart(`🚨 *Assinatura Atrasada*\n\n` +
            `Identificamos que sua assinatura de *${valor}* ainda não foi paga.\n` +
            `Em breve suas automações podem ser suspensas. Acesse o sistema e regularize.`);
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
    }
};
