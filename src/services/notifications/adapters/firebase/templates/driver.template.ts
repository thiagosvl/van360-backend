import { PushNotificationAction } from "../../../../../types/enums.js";
import { TRIAL_BONUS_INACTIVE_DAYS } from "../../../../../config/constants.js";
import { NotificationContextFormatter } from "../../../utils/notification-context.formatter.js";
import { NotificationUrlBuilder } from "../../../utils/notification-url.builder.js";
import { FirebaseMessagePayload } from "../firebase.template.js";

export class FirebaseDriverTemplates {
    static welcomeTrial(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const driverName = NotificationContextFormatter.getFirstName(ctx.nomeMotorista as string, "Motorista");
        return {
            title: "Bem-vindo ao Van360! 🎉",
            body: `Olá ${driverName}, seu período de teste começou. Aproveite todas as funcionalidades!`,
            data: {
                action: PushNotificationAction.OPEN_HOME,
                userId: (ctx.usuarioId || ctx.userId || "") as string
            }
        };
    }

    static trialEnded(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const driverName = NotificationContextFormatter.getFirstName(ctx.nomeMotorista as string, "Motorista");
        const checkoutUrl = NotificationUrlBuilder.getExternalCheckoutBridgeUrl({
            autoOpen: true,
            token: (ctx.tokenCheckout || ctx.token) as string
        });

        return {
            title: "Seu teste expirou ⏰",
            body: `Olá ${driverName}, assine agora e continue gerindo sua frota sem interrupções!`,
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                checkoutUrl
            }
        };
    }

    static trialLastCall(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const checkoutUrl = NotificationUrlBuilder.getExternalCheckoutBridgeUrl({
            autoOpen: true,
            token: (ctx.tokenCheckout || ctx.token) as string
        });

        return {
            title: "Último dia de acesso gratuito ⚠️",
            body: "Seu teste grátis encerra amanhã. Assine hoje para não perder acesso à sua frota.",
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                checkoutUrl
            }
        };
    }

    static trialBonusInactive(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const driverName = NotificationContextFormatter.getFirstName(ctx.nomeMotorista as string, "Motorista");
        const bonusDays = (ctx.bonusDays as number) || TRIAL_BONUS_INACTIVE_DAYS;

        return {
            title: "Mais tempo para você! 🎁",
            body: `Olá ${driverName}, liberamos +${bonusDays} dias gratuitos para você testar o Van360 com calma. Aproveite para cadastrar seus passageiros!`,
            data: {
                action: PushNotificationAction.OPEN_HOME,
                userId: (ctx.usuarioId || ctx.userId || "") as string
            }
        };
    }

    static trialRecovery1(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const checkoutUrl = NotificationUrlBuilder.getExternalCheckoutBridgeUrl({
            autoOpen: true,
            token: (ctx.tokenCheckout || ctx.token) as string
        });

        return {
            title: "Sentimos sua falta! 💙",
            body: "Seu acesso encerrou, mas seus dados estão salvos. Assine e volte a usar o Van360!",
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                checkoutUrl
            }
        };
    }

    static trialRecovery2(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const formattedValue = NotificationContextFormatter.formatValue(ctx.valorPromocional as number | string);
        const valorTexto = ctx.valorPromocional
            ? `por apenas ${formattedValue}/mês!`
            : "agora mesmo!";

        const checkoutUrl = NotificationUrlBuilder.getExternalCheckoutBridgeUrl({
            autoOpen: true,
            token: (ctx.tokenCheckout || ctx.token) as string
        });

        return {
            title: "Oferta especial pra você! 🎁",
            body: `Reative seu Van360 ${valorTexto}`,
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                checkoutUrl
            }
        };
    }

    static contractSignedDriver(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const passName = NotificationContextFormatter.getFirstAndLastName(ctx.nomePassageiro as string, "Passageiro");
        const rawTokenOrLink = (ctx.linkAssinatura || ctx.linkContrato || ctx.contratoUrl || ctx.tokenAssinatura || ctx.token || "") as string;
        const contractUrl = NotificationUrlBuilder.getContractSignatureUrl(rawTokenOrLink);

        return {
            title: "Novo Contrato Assinado! 📝",
            body: `O responsável pelo(a) ${passName} acabou de assinar o contrato.`,
            data: {
                action: PushNotificationAction.OPEN_CONTRACTS,
                contractUrl
            }
        };
    }

    static subscriptionPaid(ctx: Record<string, unknown>): FirebaseMessagePayload {
        return {
            title: "Assinatura Confirmada! ✅",
            body: "Seu pagamento foi aprovado. Obrigado por continuar com o Van360!",
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                userId: (ctx.usuarioId || ctx.userId || "") as string
            }
        };
    }

    static renewalReminder(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const checkoutUrl = NotificationUrlBuilder.getExternalCheckoutBridgeUrl({
            autoOpen: false,
            token: (ctx.tokenCheckout || ctx.token) as string
        });

        return {
            title: "Renovação se Aproximando ⚠️",
            body: "Sua assinatura do Van360 expira em breve. Garanta sua renovação!",
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                checkoutUrl
            }
        };
    }

    static renewalUrgency(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const checkoutUrl = NotificationUrlBuilder.getExternalCheckoutBridgeUrl({
            autoOpen: true,
            token: (ctx.tokenCheckout || ctx.token) as string
        });

        return {
            title: "Aviso de Vencimento 🚨",
            body: "Sua assinatura expira amanhã. Não perca acesso ao sistema!",
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                checkoutUrl
            }
        };
    }

    static renewalRecovery1(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const checkoutUrl = NotificationUrlBuilder.getExternalCheckoutBridgeUrl({
            autoOpen: true,
            token: (ctx.tokenCheckout || ctx.token) as string
        });

        return {
            title: "Sua Assinatura Venceu! ❌",
            body: "Renove agora para continuar tendo acesso total à sua frota.",
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                checkoutUrl
            }
        };
    }

    static renewalRecoveryFinal(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const checkoutUrl = NotificationUrlBuilder.getExternalCheckoutBridgeUrl({
            autoOpen: true,
            token: (ctx.tokenCheckout || ctx.token) as string
        });

        return {
            title: "Último Aviso de Suspensão ⛔",
            body: "Sua conta será suspensa. Regularize sua assinatura imediatamente!",
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                checkoutUrl
            }
        };
    }

    static weeklySummary(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const totalProximos = typeof ctx.totalProximos === "number" ? ctx.totalProximos : Number(ctx.totalProximos) || 0;
        const totalAtrasado = typeof ctx.totalAtrasado === "number" ? ctx.totalAtrasado : Number(ctx.totalAtrasado) || 0;
        const qtdProximos = typeof ctx.qtdProximos === "number" ? ctx.qtdProximos : Number(ctx.qtdProximos) || 0;
        const qtdAtrasados = typeof ctx.qtdAtrasados === "number" ? ctx.qtdAtrasados : Number(ctx.qtdAtrasados) || 0;

        let title = "Pagamentos da Semana 🚐💵";
        let body = "Confira os pagamentos dos seus passageiros no app.";

        if (totalProximos > 0 && totalAtrasado > 0) {
            const proximosLabel = qtdProximos === 1 ? "1 parcela" : `${qtdProximos} parcelas`;
            const atrasadosLabel = qtdAtrasados === 1 ? "1 em aberto" : `${qtdAtrasados} em aberto`;
            title = "Pagamentos da Semana 🚐💵";
            body = `Você tem ${NotificationContextFormatter.formatValue(totalProximos)} para receber esta semana (${proximosLabel}) e ${atrasadosLabel}. Não esqueça de conferir e dar baixa!`;
        } else if (totalProximos > 0) {
            const proximosLabel = qtdProximos === 1 ? "1 parcela vencendo" : `${qtdProximos} parcelas vencendo`;
            title = "Pagamentos da Semana 🚐💵";
            body = `Você tem ${proximosLabel} nos próximos dias (${NotificationContextFormatter.formatValue(totalProximos)}). Confira no app.`;
        } else if (totalAtrasado > 0) {
            const atrasadosLabel = qtdAtrasados === 1 ? "1 parcela que consta" : `${qtdAtrasados} parcelas que constam`;
            title = "Parcelas em Aberto ⚠️";
            body = `Você tem ${atrasadosLabel} em aberto (${NotificationContextFormatter.formatValue(totalAtrasado)}). Confira se já caiu na sua conta e dê baixa.`;
        }

        return {
            title,
            body,
            data: {
                action: PushNotificationAction.OPEN_BILLING,
                userId: (ctx.usuarioId || ctx.userId || "") as string
            }
        };
    }

    static birthdayReminder(ctx: Record<string, unknown>): FirebaseMessagePayload {
        return {
            title: "Aniversariantes da Semana 🎂",
            body: "Confira quem faz aniversário esta semana e dê os parabéns aos seus passageiros!",
            data: {
                action: PushNotificationAction.OPEN_BIRTHDAYS,
                userId: (ctx.usuarioId || ctx.userId || "") as string
            }
        };
    }

    static referralBonus(ctx: Record<string, unknown>): FirebaseMessagePayload {
        return {
            title: "Bônus de Indicação! 💰",
            body: "Você ganhou um mês grátis! Seu indicado realizou a assinatura.",
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                userId: (ctx.usuarioId || ctx.userId || "") as string
            }
        };
    }

    static referralRegistered(ctx: Record<string, unknown>): FirebaseMessagePayload {
        return {
            title: "Novo Indicado! 🤝",
            body: "Seu amigo se cadastrou pelo seu link!",
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                userId: (ctx.usuarioId || ctx.userId || "") as string
            }
        };
    }

    static subscriptionDueToday(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const driverName = NotificationContextFormatter.getFirstName(ctx.nomeMotorista as string, "Motorista");
        const checkoutUrl = NotificationUrlBuilder.getExternalCheckoutBridgeUrl({
            autoOpen: true,
            token: (ctx.tokenCheckout || ctx.token) as string
        });

        return {
            title: "Sua Assinatura Vence Hoje! ⚠️",
            body: `Olá ${driverName}, renove hoje seu acesso ao Van360 para evitar bloqueios.`,
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                checkoutUrl
            }
        };
    }

    static subscriptionOverdue(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const checkoutUrl = NotificationUrlBuilder.getExternalCheckoutBridgeUrl({
            autoOpen: true,
            token: (ctx.tokenCheckout || ctx.token) as string
        });

        return {
            title: "Assinatura Expirada ⛔",
            body: "Sua assinatura do Van360 expirou por falta de pagamento. Regularize para reativar.",
            data: {
                action: PushNotificationAction.OPEN_SUBSCRIPTION,
                checkoutUrl
            }
        };
    }

    static newPassengerPreRegistration(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const parentName = NotificationContextFormatter.getFirstName((ctx.nomeResponsavel || ctx.nomePai || ctx.nome) as string, "Responsável");
        const studentName = (ctx.nomePassageiro || ctx.nomeAluno || "novo aluno") as string;
        const requestsUrl = NotificationUrlBuilder.getPassengerRequestsUrl();

        return {
            title: "Novo pré-cadastro recebido! 🚌",
            body: `${parentName} enviou o pré-cadastro de ${studentName}. Toque para revisar.`,
            data: {
                action: PushNotificationAction.OPEN_PASSENGER_REQUESTS,
                targetUrl: requestsUrl,
                passageiroId: (ctx.passageiroId || ctx.id || "") as string
            }
        };
    }

    static absenceRegisteredByParent(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const studentName = (ctx.nomePassageiro || ctx.nomeAluno || "O aluno") as string;
        const routeName = (ctx.nomeRota || ctx.rota || "rota") as string;
        const formattedDate = (ctx.dataFormatada || ctx.data || "") as string;

        return {
            title: "Notificação de Ausência 🚫",
            body: `O responsável informou que ${studentName} estará ausente na ${routeName} no dia ${formattedDate}.`,
            data: {
                action: PushNotificationAction.OPEN_ROUTE,
                passageiroId: (ctx.passageiroId || "") as string,
                rotaId: (ctx.rotaId || "") as string,
                dataAusencia: (ctx.dataAusencia || "") as string
            }
        };
    }

    static absenceRemovedByParent(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const studentName = (ctx.nomePassageiro || ctx.nomeAluno || "O aluno") as string;
        const routeName = (ctx.nomeRota || ctx.rota || "rota") as string;
        const formattedDate = (ctx.dataFormatada || ctx.data || "") as string;

        return {
            title: "Ausência Cancelada! 🚌",
            body: `O responsável cancelou a ausência de ${studentName} na ${routeName} do dia ${formattedDate}.`,
            data: {
                action: PushNotificationAction.OPEN_ROUTE,
                passageiroId: (ctx.passageiroId || "") as string,
                rotaId: (ctx.rotaId || "") as string,
                dataAusencia: (ctx.dataAusencia || "") as string
            }
        };
    }
}
