import { PushNotificationAction } from "../../../../../types/enums.js";
import { NotificationContextFormatter } from "../../../utils/notification-context.formatter.js";
import { NotificationUrlBuilder } from "../../../utils/notification-url.builder.js";
import { FirebaseMessagePayload } from "../firebase.template.js";

export class FirebasePassengerTemplates {
    static routeStartedIda(ctx: Record<string, unknown>): FirebaseMessagePayload {
        return {
            title: "Rota Iniciada! 🚌",
            body: "A van já iniciou a rota de ida para a escola. Avisaremos quando estiver a caminho da sua residência!",
            data: {
                action: PushNotificationAction.OPEN_ROUTE,
                passageiroId: (ctx.passageiroId || "") as string
            }
        };
    }

    static routeStartedVolta(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const passName = NotificationContextFormatter.getFirstName(ctx.nomePassageiro as string, "Aluno");
        return {
            title: "Voltando para Casa! 🏡",
            body: `A van já saiu da escola com ${passName} e iniciou o trajeto de volta!`,
            data: {
                action: PushNotificationAction.OPEN_ROUTE,
                passageiroId: (ctx.passageiroId || "") as string
            }
        };
    }

    static routeEnRouteIda(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const passName = NotificationContextFormatter.getFirstName(ctx.nomePassageiro as string, "Aluno");
        return {
            title: "Van a Caminho! 🚌",
            body: `A van está a caminho da sua residência para buscar ${passName}.`,
            data: {
                action: PushNotificationAction.OPEN_ROUTE,
                passageiroId: (ctx.passageiroId || "") as string
            }
        };
    }

    static routeBoardedIda(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const passName = NotificationContextFormatter.getFirstName(ctx.nomePassageiro as string, "Aluno");
        return {
            title: "Embarque Confirmado ✅",
            body: `O aluno ${passName} já embarcou na van a caminho da escola!`,
            data: {
                action: PushNotificationAction.OPEN_ROUTE,
                passageiroId: (ctx.passageiroId || "") as string
            }
        };
    }

    static routeBoardingCancelledIda(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const passName = NotificationContextFormatter.getFirstName(ctx.nomePassageiro as string, "Aluno");
        return {
            title: "Aviso da Rota ⚠️",
            body: `Por favor, desconsidere a confirmação anterior. O aluno ${passName} não embarcou na van.`,
            data: {
                action: PushNotificationAction.OPEN_ROUTE,
                passageiroId: (ctx.passageiroId || "") as string
            }
        };
    }

    static routeEnRouteVolta(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const passName = NotificationContextFormatter.getFirstName(ctx.nomePassageiro as string, "Aluno");
        return {
            title: `${passName} Chegando! 🏡`,
            body: "A van está a caminho da sua residência para desembarcar o aluno.",
            data: {
                action: PushNotificationAction.OPEN_ROUTE,
                passageiroId: (ctx.passageiroId || "") as string
            }
        };
    }

    static routeDisembarkedVolta(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const passName = NotificationContextFormatter.getFirstName(ctx.nomePassageiro as string, "Aluno");
        return {
            title: "Desembarque Confirmado ✅",
            body: `O aluno ${passName} desembarcou com segurança!`,
            data: {
                action: PushNotificationAction.OPEN_ROUTE,
                passageiroId: (ctx.passageiroId || "") as string
            }
        };
    }

    static routeDisembarkingCancelledVolta(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const passName = NotificationContextFormatter.getFirstName(ctx.nomePassageiro as string, "Aluno");
        return {
            title: "Aviso da Rota ⚠️",
            body: `Por favor, desconsidere a confirmação anterior. O aluno ${passName} não desembarcou da van.`,
            data: {
                action: PushNotificationAction.OPEN_ROUTE,
                passageiroId: (ctx.passageiroId || "") as string
            }
        };
    }

    static routeReordered(ctx: Record<string, unknown>): FirebaseMessagePayload {
        return {
            title: "Rota Atualizada 📍",
            body: "O motorista ajustou a ordem das paradas. Avisaremos assim que a van estiver a caminho novamente.",
            data: {
                action: PushNotificationAction.OPEN_ROUTE,
                passageiroId: (ctx.passageiroId || "") as string
            }
        };
    }

    static dueSoonParent(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const passName = NotificationContextFormatter.getFirstAndLastName(ctx.nomePassageiro as string, "Aluno");
        const valorStr = NotificationContextFormatter.formatRawValue(ctx.valor as number | string);
        const dataStr = NotificationContextFormatter.formatDate(ctx.dataVencimento as string);
        const diasAntecedencia = ctx.diasAntecedencia as number | undefined;

        let body = `A parcela de ${passName} (R$ ${valorStr}) vence em ${dataStr}.`;
        if (diasAntecedencia && diasAntecedencia > 0) {
            const rotuloDias = diasAntecedencia === 1 ? "daqui a 1 dia" : `daqui a ${diasAntecedencia} dias`;
            body = `Lembrete: A parcela de ${passName} (R$ ${valorStr}) vence ${rotuloDias} (${dataStr}).`;
        }

        return {
            title: "Vencimento Próximo 🔔",
            body,
            data: {
                action: PushNotificationAction.OPEN_HOME,
                cobrancaId: (ctx.cobrancaId || "") as string,
                passageiroId: (ctx.passageiroId || "") as string,
                tab: "parcelas"
            }
        };
    }

    static dueTodayParent(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const passName = NotificationContextFormatter.getFirstAndLastName(ctx.nomePassageiro as string, "Aluno");
        const valorStr = NotificationContextFormatter.formatRawValue(ctx.valor as number | string);

        return {
            title: "Parcela Vence Hoje ⚠️",
            body: `Hoje é o dia do vencimento da parcela de ${passName} (R$ ${valorStr}).`,
            data: {
                action: PushNotificationAction.OPEN_HOME,
                cobrancaId: (ctx.cobrancaId || "") as string,
                passageiroId: (ctx.passageiroId || "") as string,
                tab: "parcelas"
            }
        };
    }

    static overdueParent(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const passName = NotificationContextFormatter.getFirstAndLastName(ctx.nomePassageiro as string, "Aluno");
        const valorStr = NotificationContextFormatter.formatRawValue(ctx.valor as number | string);
        const diasAtraso = ctx.diasAtraso as number | undefined;

        let body = `A parcela de ${passName} (R$ ${valorStr}) está em atraso.`;
        if (diasAtraso && diasAtraso > 0) {
            const rotuloDias = diasAtraso === 1 ? "1 dia" : `${diasAtraso} dias`;
            body = `A parcela de ${passName} (R$ ${valorStr}) está em atraso há ${rotuloDias}.`;
        }

        return {
            title: "Parcela Em Atraso 🔴",
            body,
            data: {
                action: PushNotificationAction.OPEN_HOME,
                cobrancaId: (ctx.cobrancaId || "") as string,
                passageiroId: (ctx.passageiroId || "") as string,
                tab: "parcelas"
            }
        };
    }

    static paymentReceiptParent(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const passName = NotificationContextFormatter.getFirstAndLastName(ctx.nomePassageiro as string, "Aluno");
        const mes = ctx.mes as number | undefined;
        const ano = ctx.ano as number | undefined;

        let mesAnoStr = "";
        if (mes && ano) {
            mesAnoStr = ` referente a ${String(mes).padStart(2, '0')}/${ano}`;
        }

        return {
            title: "Recibo de Pagamento 🧾",
            body: `O pagamento de ${passName}${mesAnoStr} foi registrado com sucesso.`,
            data: {
                action: PushNotificationAction.OPEN_HOME,
                reciboUrl: (ctx.reciboUrl || "") as string,
                cobrancaId: (ctx.cobrancaId || "") as string,
                tab: "parcelas",
                autoOpenRecibo: "true"
            }
        };
    }

    static contractSignedParent(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const passName = NotificationContextFormatter.getFirstAndLastName(ctx.nomePassageiro as string, "Aluno");
        const rawTokenOrLink = (ctx.linkAssinatura || ctx.linkContrato || ctx.contratoUrl || ctx.tokenAssinatura || ctx.token || "") as string;
        const contractUrl = NotificationUrlBuilder.getContractSignatureUrl(rawTokenOrLink);

        return {
            title: "Contrato Assinado com Sucesso! 📝",
            body: `Sua cópia do contrato de transporte de ${passName} já está disponível.`,
            data: {
                action: PushNotificationAction.OPEN_CONTRACTS,
                contractUrl
            }
        };
    }
}

