import { formatToBrazilianDate } from "../../../utils/date.utils.js";
import { formatCurrency, getFirstName } from "../../../utils/format.js";
import { CompositeMessagePart } from "../../../types/dtos/whatsapp.dto.js";

export interface DriverContext {
    nomeMotorista: string;
    valor?: number;
    planoNome?: string;
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
    cpfLogin?: string;
    senhaTemporaria?: string;
}

const textPart = (text: string): CompositeMessagePart[] => {
    return [{ type: "text", content: text }];
};

export const DriverTemplates = {

    welcomeTrial: (ctx: DriverContext): CompositeMessagePart[] => {
        const validade = ctx.dataVencimento ? formatToBrazilianDate(ctx.dataVencimento) : "15 dias";
        return textPart(`🚀 *Bem-vindo ao Van360!*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, sua conta está ativa com acesso completo até *${validade}*.\n\n` +
            `Comece cadastrando seus passageiros e veja a organização digital da sua van funcionando na prática.\n\n` +
            `Precisa de ajuda? Responda esta mensagem.`);
    },

    trialExpiring: (ctx: DriverContext): CompositeMessagePart[] => {
        const dias = ctx.trialDays ?? "alguns";
        const diasLabel = dias === 1 ? "dia" : "dias";
        const validade = ctx.dataVencimento ? formatToBrazilianDate(ctx.dataVencimento) : "";
        const prazoStr = validade ? `após *${validade}*` : `em *${dias} ${diasLabel}*`;
        return textPart(`⏳ *Seu teste gratuito acaba em ${dias} ${diasLabel}*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, ${prazoStr} o acesso será suspenso e você perde o controle de passageiros, cobranças e rotas.\n\n` +
            `Assine agora pelo app e continue sem interrupção.`);
    },

    trialEnded: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`🔒 *Acesso gratuito encerrado*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, seu período de teste no Van360 terminou. Seus dados estão preservados.\n\n` +
            `Assine pelo app para reativar o acesso imediatamente.`);
    },

    trialMidpointEngaged: (ctx: DriverContext): CompositeMessagePart[] => {
        const dias = ctx.trialDays ?? 8;
        return textPart(`📊 *${getFirstName(ctx.nomeMotorista)}, bom uso do Van360!*\n\n` +
            `Restam *${dias} dias* do seu acesso gratuito. Assine agora para não perder os passageiros e controles que já configurou.`);
    },

    trialMidpointInactive: (ctx: DriverContext): CompositeMessagePart[] => {
        const dias = ctx.trialDays ?? 8;
        return textPart(`👋 *${getFirstName(ctx.nomeMotorista)}, seu teste está pela metade*\n\n` +
            `Restam *${dias} dias* gratuitos. Cadastre seu primeiro passageiro agora e veja como a gestão da sua van fica mais simples.\n\n` +
            `Precisa de ajuda para começar? Responda esta mensagem.`);
    },

    trialLastCall: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`⚠️ *${getFirstName(ctx.nomeMotorista)}, amanhã seu acesso expira*\n\n` +
            `Último dia para assinar e manter o Van360 funcionando sem interrupção.`);
    },

    trialToday: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`🚨 *Último dia de acesso gratuito*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, seu teste no Van360 encerra *hoje*. Assine agora pelo app para não perder seus dados e configurações.`);
    },

    trialRecovery1: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`🔔 *${getFirstName(ctx.nomeMotorista)}, seu acesso ao Van360 está suspenso*\n\n` +
            `Seus dados e configurações continuam preservados. Assine pelo app para reativar imediatamente.`);
    },

    trialRecovery2: (ctx: DriverContext): CompositeMessagePart[] => {
        if (ctx.valorPromocional) {
            return textPart(`🎁 *Oferta especial para você, ${getFirstName(ctx.nomeMotorista)}*\n\n` +
                `Sua conta Van360 está suspensa. Reative agora por apenas *R$ ${ctx.valorPromocional.toFixed(2).replace('.', ',')}/mês* — oferta por tempo limitado.\n\n` +
                `Seus dados estão preservados. A reativação é imediata pelo app.`);
        }
        return textPart(`🔔 *${getFirstName(ctx.nomeMotorista)}, reative seu Van360*\n\n` +
            `Sua conta está suspensa, mas seus dados continuam preservados. Assine pelo app para reativar imediatamente.`);
    },

    trialRecoveryFinal: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`${getFirstName(ctx.nomeMotorista)}, este é nosso último contato sobre o Van360.\n\n` +
            `Sua conta e dados permanecem preservados caso decida reativar no futuro.`);
    },

    renewalLembrete: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = ctx.valor ? formatCurrency(ctx.valor) : "";
        const valorStr = valor ? ` de *${valor}*` : "";
        const planoStr = ctx.planoNome ? ` (Plano *${ctx.planoNome}*)` : "";
        const isCard = ctx.metodoCobranca === "credit_card";
        const extra = isCard
            ? ` A cobrança no cartão não foi processada.\n\nAtualize o cartão ou pague via Pix no app.`
            : ctx.pixCopiaECola
                ? `\n\n💳 *Pix Copia e Cola:*\n${ctx.pixCopiaECola}\n\n_Copie e pague pelo app do seu banco._`
                : `\n\nRegularize pelo app para manter o acesso.`;
        return textPart(`🔔 *Pagamento pendente — Van360*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, sua assinatura${planoStr}${valorStr} venceu ontem.${extra}`);
    },

    renewalUrgencia: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = ctx.valor ? formatCurrency(ctx.valor) : "";
        const valorStr = valor ? ` de *${valor}*` : "";
        const planoStr = ctx.planoNome ? ` (Plano *${ctx.planoNome}*)` : "";
        const isCard = ctx.metodoCobranca === "credit_card";
        const extra = isCard
            ? ` Atualize o cartão ou pague via Pix no app para evitar a suspensão.`
            : ctx.pixCopiaECola
                ? `\n\n💳 *Pix Copia e Cola:*\n${ctx.pixCopiaECola}\n\n_Copie e pague pelo app do seu banco._`
                : `\n\nRegularize hoje para evitar a suspensão.`;
        return textPart(`🚨 *Acesso será suspenso amanhã*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, o pagamento${valorStr} da sua assinatura${planoStr} Van360 não foi confirmado.${extra}`);
    },

    renewalRecovery1: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`🔒 *Assinatura suspensa — Van360*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, sua conta foi suspensa por falta de pagamento. Seus dados estão preservados.\n\n` +
            `Renove pelo app para reativar o acesso.`);
    },

    renewalRecoveryFinal: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`${getFirstName(ctx.nomeMotorista)}, este é nosso último contato sobre sua assinatura Van360.\n\n` +
            `Sua conta continua disponível para reativação quando quiser.`);
    },

    paymentConfirmed: (ctx: DriverContext): CompositeMessagePart[] => {
        const data = ctx.dataVencimento ? formatToBrazilianDate(ctx.dataVencimento) : "";
        const planoStr = ctx.planoNome ? `🏷️ Plano: *${ctx.planoNome}*` : "";
        const dataStr = data ? `📅 Próximo vencimento: *${data}*` : "";

        const details = [planoStr, dataStr].filter(Boolean).join('\n');

        return textPart(`✅ *Pagamento confirmado — Van360*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, pagamento recebido com sucesso. Seu acesso está ativo.` +
            (details ? `\n\n${details}` : ""));
    },

    dueToday: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = ctx.valor ? formatCurrency(ctx.valor) : "";
        const valorStr = valor ? ` de *${valor}*` : "";
        const planoStr = ctx.planoNome ? ` (Plano *${ctx.planoNome}*)` : "";
        return textPart(`⚠️ *Assinatura venceu hoje — Van360*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, o pagamento${valorStr} da sua assinatura${planoStr} Van360 venceu hoje. Regularize para manter o acesso ativo.`);
    },

    dueSoon: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = ctx.valor ? formatCurrency(ctx.valor) : "";
        const data = ctx.dataVencimento ? formatToBrazilianDate(ctx.dataVencimento) : "";
        const valorStr = valor ? ` de *${valor}*` : "";
        const dataTitle = data ? `em ${data}` : "em breve";
        const planoStr = ctx.planoNome ? `\n🏷️ Plano: *${ctx.planoNome}*` : "";
        const pixExtra = ctx.pixCopiaECola
            ? `\n\n💳 *Pix Copia e Cola:*\n${ctx.pixCopiaECola}\n\n_Copie e pague pelo app do seu banco._`
            : "";

        return textPart(`🗓️ *Assinatura vence ${dataTitle}*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, sua mensalidade Van360${valorStr} vence em breve.${planoStr}\n\nMantenha em dia para não interromper suas cobranças.${pixExtra}`);
    },

    overdue: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = ctx.valor ? formatCurrency(ctx.valor) : "";
        const valorStr = valor ? ` de *${valor}*` : "";
        const planoStr = ctx.planoNome ? ` (Plano *${ctx.planoNome}*)` : "";
        return textPart(`🚨 *Acesso suspenso — Van360*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, sua assinatura${planoStr}${valorStr} foi suspensa por falta de pagamento. Renove pelo app para reativar.`);
    },

    contractSigned: (ctx: DriverContext): CompositeMessagePart[] => {
        const nomePas = getFirstName(ctx.nomePassageiro) || "passageiro";
        const nomeResp = ctx.nomeResponsavel ? ` (responsável ${getFirstName(ctx.nomeResponsavel)})` : "";
        const linkStr = ctx.contratoUrl ? `\n\n📄 Veja o contrato:\n${ctx.contratoUrl}` : "";
        return textPart(`✍️ *Contrato assinado — ${ctx.nomePassageiro}*\n\n` +
            `O contrato de *${nomePas}*${nomeResp} foi assinado com sucesso.${linkStr}`);
    },

    authRecovery: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`🔐 *Código de verificação — Van360*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, seu código para redefinir a senha:\n\n` +
            `👉 *${ctx.otpCode}*\n\n` +
            `Válido por 15 minutos. Ignore se não foi você.`);
    },

    passwordChanged: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`✅ *Senha alterada — Van360*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, a senha da sua conta foi alterada com sucesso.\n\n` +
            `🛑 *Não foi você?* Entre em contato com o suporte imediatamente.`);
    },

    cardChargeNotice: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = ctx.valor ? formatCurrency(ctx.valor) : "";
        const cardStr = ctx.cardLast4 ? ` final *${ctx.cardLast4}*` : "";
        const dataStr = ctx.dataVencimento ? `em ${formatToBrazilianDate(ctx.dataVencimento)}` : "em breve";
        const planoStr = ctx.planoNome ? `🏷️ Plano: *${ctx.planoNome}*\n\n` : "";
        return textPart(`🔄 *Renovação automática ${dataStr}*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, ` +
            (valor ? `*${valor}* será debitado no cartão${cardStr}.\n\n` : `sua assinatura será renovada.\n\n`) +
            planoStr +
            `Para alterar o cartão ou pagar via Pix, acesse o app antes dessa data.`);
    },

    failedCC: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = ctx.valor ? formatCurrency(ctx.valor) : "";
        const valorStr = valor ? ` *${valor}*` : "";
        return textPart(`❌ *Falha na cobrança automática — Van360*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, não foi possível cobrar${valorStr} no seu cartão de crédito.\n\n` +
            `Atualize o cartão ou pague via Pix no app para manter a conta ativa.`);
    },

    welcomeAdminCreated: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`🚀 *Seu acesso ao Van360*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, sua conta foi criada.\n\n` +
            `*Dados de acesso:*\n` +
            `👤 CPF: ${ctx.cpfLogin || ""}\n` +
            `🔑 Senha: ${ctx.senhaTemporaria || ""} _(altere no primeiro acesso)_\n\n` +
            `🔗 Faça login através do app ou acesse o site: https://van360.com.br/login`);
    },

    adminResetPassword: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`🔐 *Senha redefinida — Van360*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, sua senha foi redefinida pelo administrador.\n\n` +
            `*Novos dados de acesso:*\n` +
            `👤 CPF: ${ctx.cpfLogin || ""}\n` +
            `🔑 Nova senha: ${ctx.senhaTemporaria || ""}\n\n` +
            `🔗 Faça login através do app ou acesse o site: https://van360.com.br/login`);
    },

    referralBonusReceived: (ctx: DriverContext): CompositeMessagePart[] => {
        const dias = ctx.trialDays || 30;
        const diasLabel = dias === 1 ? "dia" : "dias";
        const novaValidade = ctx.dataVencimento ? formatToBrazilianDate(ctx.dataVencimento) : "";
        const validadeTexto = novaValidade ? ` A nova validade do seu plano é *${novaValidade}*.` : "";

        return textPart(`🎉 *Recompensa: ${dias} ${diasLabel} grátis! — Van360*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, um motorista que você indicou realizou a assinatura do app.\n\n` +
            `Como agradecimento, acabamos de adicionar mais *${dias} ${diasLabel}* de acesso gratuito na sua assinatura!${validadeTexto}\n\n` +
            `Continue indicando o Van360 para ganhar mais.`);
    }
};
