import { formatToBrazilianDate, getShortWeekDayBR } from "../../../../../utils/date.utils.js";
import { formatCurrency, formatCpfCnpj, getFirstName, getFirstAndSecondName } from "../../../../../utils/format.js";
import { CompositeMessagePart } from "../../../../../types/dtos/evolution.dto.js";
import { CheckoutPaymentMethod } from "../../../../../types/enums.js";
import { env } from "../../../../../config/env.js";

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
    isFirstSubscription?: boolean;
    // Aniversários
    aniversariantesList?: { veiculo: string; nome: string; dia: number; mes: number; escola: string }[];
    passageirosSemData?: number;
    // Resumo de cobrança do motorista
    cobrancasAtrasadasList?: { passageiroNome: string; responsavelNome: string; telefoneResponsavel: string; valor: number; diasAtraso: number; mesOrigemStr?: string }[];
    cobrancasProximos7DiasList?: { passageiroNome: string; responsavelNome?: string; dataVencimentoStr: string; diaSemanaStr: string; valor: number }[];
    totalAtrasado?: number;
    totalProximos?: number;
    dataRefStr?: string;
}

const textPart = (text: string): CompositeMessagePart[] => {
    return [{ type: "text", content: text }];
};

export const DriverTemplates = {














    dueToday: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = ctx.valor ? formatCurrency(ctx.valor) : "";
        const valorStr = valor ? ` de *${valor}*` : "";
        const planoStr = ctx.planoNome ? ` (Plano *${ctx.planoNome}*)` : "";

        if (ctx.pixCopiaECola) {
            return [
                {
                    type: "text",
                    content: `⚠️ *Sua assinatura Van360 vence hoje*\n\n` +
                        `${getFirstName(ctx.nomeMotorista)}, hoje é o dia de renovar o seu acesso${valorStr}${planoStr}.\n\n` +
                        `📲 _Pague hoje para evitar a pausa nas suas rotas e no controle financeiro da sua van._\n\n` +
                        `Segue o código Pix Copia e Cola para pagamento:`
                },
                {
                    type: "text",
                    content: ctx.pixCopiaECola
                },
                {
                    type: "text",
                    content: `_Copie o código Pix acima e pague pelo app do seu banco._`
                }
            ];
        }

        return textPart(`⚠️ *Sua assinatura Van360 vence hoje*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, hoje é o dia de renovar o seu acesso${valorStr}${planoStr}.\n\n📲 _Pague hoje para evitar a pausa nas suas rotas e no controle financeiro da sua van._`);
    },

    dueSoon: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = ctx.valor ? formatCurrency(ctx.valor) : "";
        const data = ctx.dataVencimento ? formatToBrazilianDate(ctx.dataVencimento) : "";
        const valorStr = valor ? ` de *${valor}*` : "";
        const dataTitle = data ? `em ${data}` : "em breve";
        const dataDia = data ? `dia ${data}` : "em breve";
        const planoStr = ctx.planoNome ? `\n🏷️ Plano: *${ctx.planoNome}*` : "";

        if (ctx.pixCopiaECola) {
            return [
                {
                    type: "text",
                    content: `🗓️ *Assinatura Van360 vence ${dataTitle}*\n\n` +
                        `${getFirstName(ctx.nomeMotorista)}, sua mensalidade${valorStr} vence ${dataDia}.${planoStr}\n\n` +
                        `🚐 _Garanta que o envio automático de cobranças e os lembretes para os pais continuem funcionando perfeitamente!_\n\n` +
                        `Segue o código Pix Copia e Cola para pagamento:`
                },
                {
                    type: "text",
                    content: ctx.pixCopiaECola
                },
                {
                    type: "text",
                    content: `_Copie o código Pix acima e pague pelo app do seu banco._`
                }
            ];
        }

        return textPart(`🗓️ *Assinatura Van360 vence ${dataTitle}*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, sua mensalidade${valorStr} vence ${dataDia}.${planoStr}\n\n🚐 _Garanta que o envio automático de cobranças e os lembretes para os pais continuem funcionando perfeitamente!_`);
    },

    overdue: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = ctx.valor ? formatCurrency(ctx.valor) : "";
        const valorStr = valor ? ` de *${valor}*` : "";
        const planoStr = ctx.planoNome ? ` *${ctx.planoNome}*` : "";
        const isCard = ctx.metodoCobranca === CheckoutPaymentMethod.CREDIT_CARD;

        const instrucao = isCard
            ? "Acesse o aplicativo para atualizar seu cartão ou efetuar o pagamento e reativar seu acesso na hora."
            : "Pague o Pix enviado anteriormente (ou acesse o aplicativo) para reativar seu acesso na hora.";

        return textPart(`🚨 *Acesso temporariamente pausado*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, não identificamos o pagamento da sua assinatura${planoStr}${valorStr}. Por isso, as cobranças automáticas para os seus alunos foram pausadas.\n\n` +
            `🔓 _A boa notícia é que todos os seus dados estão a salvo! ${instrucao}_`);
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

    failedCC: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = ctx.valor ? formatCurrency(ctx.valor) : "";
        const valorStr = valor ? ` de *${valor}*` : "";
        return textPart(`❌ *Não conseguimos processar seu cartão*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, houve uma recusa do banco ao tentar debitar sua assinatura${valorStr} (isso geralmente ocorre por falta de limite ou bloqueio de segurança).\n\n` +
            `💳 _Atualize o cartão ou gere um Pix para não ter suas automações pausadas._`);
    },

    welcomeAdminCreated: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`🚀 *Bem-vindo ao Van360!*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, sua conta foi criada e está pronta para uso.\n\n` +
            `*Dados de acesso:*\n` +
            `👤 Documento: ${ctx.cpfLogin || ""}\n` +
            `🔑 Senha: ${ctx.senhaTemporaria || ""} _(altere no primeiro acesso)_\n\n` +
            `🔗 Acesse: ${env.FRONTEND_URL}/login`);
    },

    adminResetPassword: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`🔐 *Senha redefinida — Van360*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, sua senha foi redefinida.\n\n` +
            `*Novos dados de acesso:*\n` +
            `👤 Documento: ${ctx.cpfLogin || ""}\n` +
            `🔑 Nova senha: ${ctx.senhaTemporaria || ""}\n\n` +
            `🔗 Acesse: ${env.FRONTEND_URL}/login`);
    },




    teamMemberCreated: (ctx: DriverContext): CompositeMessagePart[] => {
        const appUrl = env.FRONTEND_URL;
        const loginStr = ctx.cpfLogin ? formatCpfCnpj(ctx.cpfLogin) : "";
        return textPart(
            `🚐 *Acesso Van360*\n\n` +
            `Seu acesso ao aplicativo Van360 foi criado com sucesso.\n\n` +
            `📱 *Acesse em:* ${appUrl}\n` +
            `👤 *Login (CPF/CNPJ):* ${loginStr}\n` +
            `🔑 *Senha:* ${ctx.senhaTemporaria || ""}`
        );
    },

    teamMemberResetPassword: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(
            `🔑 *Van360 - Redefinição de Senha*\n\n` +
            `Sua senha de acesso ao aplicativo foi redefinida.\n\n` +
            `🔑 *Nova Senha:* ${ctx.senhaTemporaria || ""}`
        );
    },

    teamMemberStatusChanged: (ctx: DriverContext): CompositeMessagePart[] => {
        if (ctx.isEngaged) {
            return textPart(
                `✅ *Van360 - Status do Acesso*\n\n` +
                `Seu acesso ao aplicativo Van360 foi reativado. Você já pode realizar login normalmente.`
            );
        }
        return textPart(
            `🔒 *Van360 - Status do Acesso*\n\n` +
            `Seu acesso ao aplicativo Van360 foi desativado.`
        );
    }
};
