import { formatToBrazilianDate, getShortWeekDayBR } from "../../../utils/date.utils.js";
import { formatCurrency, getFirstName, getFirstAndSecondName } from "../../../utils/format.js";
import { CompositeMessagePart } from "../../../types/dtos/whatsapp.dto.js";
import { CheckoutPaymentMethod } from "../../../types/enums.js";
import { env } from "../../../config/env.js";

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
    // Aniversários
    aniversariantesList?: { veiculo: string; nome: string; dia: number; mes: number; escola: string }[];
    passageirosSemData?: number;
}

const textPart = (text: string): CompositeMessagePart[] => {
    return [{ type: "text", content: text }];
};

export const DriverTemplates = {

    welcomeTrial: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`🚀 *Bem-vindo ao Van360, ${getFirstName(ctx.nomeMotorista)}!*\n\n` +
            `Sua conta está ativa com acesso completo.\n\n` +
            `Precisa de ajuda? Responda esta mensagem — estamos aqui.`);
    },

    birthdayReminderWeekly: (ctx: DriverContext): CompositeMessagePart[] => {
        let mensagem = `⭐ *Aniversariantes da semana*\n\n`;

        if (ctx.aniversariantesList && ctx.aniversariantesList.length > 0) {

            const aniversariantesPorVeiculo = new Map<string, typeof ctx.aniversariantesList>();
            ctx.aniversariantesList.forEach((p) => {
                const veiculoNome = p.veiculo;
                if (!aniversariantesPorVeiculo.has(veiculoNome)) {
                    aniversariantesPorVeiculo.set(veiculoNome, []);
                }
                aniversariantesPorVeiculo.get(veiculoNome)?.push(p);
            });

            const anoAtual = new Date().getFullYear();

            for (const [veiculo, lista] of aniversariantesPorVeiculo.entries()) {
                mensagem += `🚐 *${veiculo}*\n`;
                lista.forEach((p) => {
                    const dataAniversario = new Date(anoAtual, p.mes - 1, p.dia);
                    const shortWeekDay = getShortWeekDayBR(dataAniversario);
                    mensagem += `• *${getFirstAndSecondName(p.nome)}* - ${shortWeekDay}, ${String(p.dia).padStart(2, '0')}/${String(p.mes).padStart(2, '0')}\n`;
                });
                mensagem += `\n`;
            }

            mensagem += `Prepare algo especial e não se esqueça de parabenizá-los! 🥳`;
        } else {
            mensagem += `Sem aniversariantes nesta semana.`;
        }

        if (ctx.passageirosSemData && ctx.passageirosSemData > 0) {
            const passageiroLabel = ctx.passageirosSemData === 1 ? "passageiro" : "passageiros";
            mensagem += `\n\n_(Lembrando que você possui ${ctx.passageirosSemData} ${passageiroLabel} sem data de nascimento cadastrada. Atualize pelo aplicativo para não perder nenhuma data!)_`;
        }

        return textPart(mensagem);
    },

    trialEnded: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`🔒 *Acesso gratuito encerrado*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, seu período de teste terminou, mas seus dados continuam preservados.\n\n` +
            `Assine pelo aplicativo para reativar o acesso imediatamente.`);
    },

    trialLastCall: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`⚠️ *${getFirstName(ctx.nomeMotorista)}, amanhã seu acesso expira*\n\n` +
            `Depois de amanhã, os controles de passageiros, parcelas e rotas serão pausados.\n\n` +
            `Assine hoje pelo aplicativo e continue com tudo funcionando.`);
    },


    trialRecovery1: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`🔔 *Sentimos sua falta, ${getFirstName(ctx.nomeMotorista)}!*\n\n` +
            `Seu acesso gratuito encerrou, mas todos os seus dados e configurações continuam guardados.\n\n` +
            `Assine pelo aplicativo para reativar seu acesso e voltar a organizar sua van.`);
    },

    trialRecovery2: (ctx: DriverContext): CompositeMessagePart[] => {
        if (ctx.valorPromocional) {
            return textPart(`🎁 *Oferta especial pra você, ${getFirstName(ctx.nomeMotorista)}!*\n\n` +
                `Reative o Van360 por apenas *R$ ${ctx.valorPromocional.toFixed(2).replace('.', ',')}/mês* — oferta por tempo limitado.\n\n` +
                `Seus dados continuam preservados. A reativação é imediata pelo aplicativo.`);
        }
        return textPart(`🔔 *Reative seu Van360, ${getFirstName(ctx.nomeMotorista)}*\n\n` +
            `Seus dados continuam preservados. Assine pelo aplicativo para reativar agora.`);
    },


    renewalLembrete: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = ctx.valor ? formatCurrency(ctx.valor) : "";
        const valorStr = valor ? ` de *${valor}*` : "";
        const planoStr = ctx.planoNome ? ` *${ctx.planoNome}*` : "";
        const isCard = ctx.metodoCobranca === CheckoutPaymentMethod.CREDIT_CARD;

        if (isCard) {
            return textPart(`🔔 *Pagamento pendente*\n\n` +
                `${getFirstName(ctx.nomeMotorista)}, sua assinatura${planoStr}${valorStr} venceu ontem e a cobrança no cartão não foi processada.\n\n` +
                `Atualize o cartão ou pague via Pix pelo aplicativo.`);
        }

        if (ctx.pixCopiaECola) {
            return [
                {
                    type: "text",
                    content: `🔔 *Pagamento pendente*\n\n` +
                        `${getFirstName(ctx.nomeMotorista)}, sua assinatura${planoStr}${valorStr} venceu ontem.\n\n` +
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

        return textPart(`🔔 *Pagamento pendente*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, sua assinatura${planoStr}${valorStr} venceu ontem.\n\n` +
            `Regularize pelo aplicativo para manter o acesso.`);
    },

    renewalUrgencia: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = ctx.valor ? formatCurrency(ctx.valor) : "";
        const valorStr = valor ? ` de *${valor}*` : "";
        const planoStr = ctx.planoNome ? ` (Plano *${ctx.planoNome}*)` : "";
        const isCard = ctx.metodoCobranca === CheckoutPaymentMethod.CREDIT_CARD;

        if (isCard) {
            return textPart(`🚨 *Acesso será pausado amanhã*\n\n` +
                `${getFirstName(ctx.nomeMotorista)}, o pagamento${valorStr} da sua assinatura${planoStr} ainda não foi confirmado.\n\n` +
                `Atualize o cartão ou pague via Pix pelo aplicativo para evitar a pausa.`);
        }

        if (ctx.pixCopiaECola) {
            return [
                {
                    type: "text",
                    content: `🚨 *Acesso será pausado amanhã*\n\n` +
                        `${getFirstName(ctx.nomeMotorista)}, o pagamento${valorStr} da sua assinatura${planoStr} ainda não foi confirmado.\n\n` +
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

        return textPart(`🚨 *Acesso será pausado amanhã*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, o pagamento${valorStr} da sua assinatura${planoStr} ainda não foi confirmado.\n\n` +
            `Regularize hoje para evitar a pausa.`);
    },

    renewalRecovery1: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`🔒 *Assinatura pausada*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, seu acesso foi temporariamente pausado por pagamento pendente.\n\n` +
            `Seus dados estão preservados. Renove pelo aplicativo para reativar a conta e voltar a gerenciar sua van.`);
    },

    renewalRecoveryFinal: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`👋 *Até logo, ${getFirstName(ctx.nomeMotorista)}!*\n\n` +
            `Não vamos mais enviar mensagens sobre a assinatura, mas agradecemos pelo tempo com a gente.\n\n` +
            `Sua conta e dados continuam salvos. Quando quiser voltar, estaremos aqui! 🚐💙`);
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
            `${getFirstName(ctx.nomeMotorista)}, não identificamos o pagamento da sua assinatura${planoStr}${valorStr}. Por isso, as cobranças automáticas para os seus passageiros foram pausadas.\n\n` +
            `🔓 _A boa notícia é que todos os seus dados estão a salvo! ${instrucao}_`);
    },

    contractSigned: (ctx: DriverContext): CompositeMessagePart[] => {
        const nomePas = getFirstName(ctx.nomePassageiro);
        const linkStr = ctx.contratoUrl ? `\n\n📄 Veja o contrato:\n${ctx.contratoUrl}` : "";
        return textPart(`✅ *Novo contrato assinado! — ${nomePas}*\n\n` +
            `*${getFirstName(ctx.nomeResponsavel)}* acabou de assinar digitalmente o contrato do passageiro *${nomePas}*.\n\n` +
            `🚐 _Vaga garantida! O documento já está salvo no seu aplicativo._${linkStr}`);
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

    referralBonusReceived: (ctx: DriverContext): CompositeMessagePart[] => {
        const dias = ctx.trialDays || 30;
        const diasLabel = dias === 1 ? "dia" : "dias";
        const novaValidade = ctx.dataVencimento ? formatToBrazilianDate(ctx.dataVencimento) : "";
        const validadeTexto = novaValidade ? ` A nova validade do seu plano é *${novaValidade}*.` : "";

        return textPart(`🎉 *Recompensa: ${dias} ${diasLabel} grátis!*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, um motorista que você indicou assinou o Van360!\n\n` +
            `Adicionamos *${dias} ${diasLabel}* de acesso gratuito à sua assinatura!${validadeTexto}\n\n` +
            `Continue indicando para ganhar mais! 🚐`);
    },

    referralRegistered: (ctx: DriverContext): CompositeMessagePart[] => {
        const bonusDays = ctx.trialDays || 30;
        return textPart(`🎉 *Novo cadastro por indicação — Van360*\n\n` +
            `${getFirstName(ctx.nomeMotorista)}, um novo motorista acabou de se cadastrar utilizando o seu convite!\n\n` +
            `Assim que ele assinar o primeiro plano, você ganha *+${bonusDays} dias grátis* automaticamente na sua assinatura! 🚀\n\n` +
            `Continue indicando e garanta mais meses de acesso gratuito! 🚐💙`);
    }
};
