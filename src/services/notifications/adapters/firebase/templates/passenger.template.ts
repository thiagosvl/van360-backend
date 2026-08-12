import { PushNotificationAction } from "../../../../../types/enums.js";
import { NotificationContextFormatter } from "../../../utils/notification-context.formatter.js";
import { NotificationUrlBuilder } from "../../../utils/notification-url.builder.js";
import { FirebaseMessagePayload } from "../firebase.template.js";

export class FirebasePassengerTemplates {
    static contractAvailableParent(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const passName = NotificationContextFormatter.getFirstAndLastName(ctx.nomePassageiro as string, "Passageiro");
        const rawTokenOrLink = (ctx.linkAssinatura || ctx.linkContrato || ctx.contratoUrl || ctx.tokenAssinatura || ctx.token || "") as string;
        const contractUrl = NotificationUrlBuilder.getContractSignatureUrl(rawTokenOrLink);

        return {
            title: "Contrato Disponível 📄",
            body: `O contrato de transporte do passageiro ${passName} está pronto para assinatura digital.`,
            data: {
                action: PushNotificationAction.OPEN_CONTRACTS,
                contractUrl
            }
        };
    }

    static routeEnRouteIda(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const passName = NotificationContextFormatter.getFirstName(ctx.nomePassageiro as string, "Passageiro");
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
        const passName = NotificationContextFormatter.getFirstName(ctx.nomePassageiro as string, "Passageiro");
        return {
            title: "Embarque Confirmado ✅",
            body: `O passageiro ${passName} já embarcou na van a caminho da escola!`,
            data: {
                action: PushNotificationAction.OPEN_ROUTE,
                passageiroId: (ctx.passageiroId || "") as string
            }
        };
    }

    static routeEnRouteVolta(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const passName = NotificationContextFormatter.getFirstName(ctx.nomePassageiro as string, "Passageiro");
        return {
            title: "Passageiro Chegando! 🏡",
            body: `A van está a caminho da sua residência para entregar ${passName}.`,
            data: {
                action: PushNotificationAction.OPEN_ROUTE,
                passageiroId: (ctx.passageiroId || "") as string
            }
        };
    }

    static routeDisembarkedVolta(ctx: Record<string, unknown>): FirebaseMessagePayload {
        const passName = NotificationContextFormatter.getFirstName(ctx.nomePassageiro as string, "Passageiro");
        return {
            title: "Entrega Confirmada ✅",
            body: `O passageiro ${passName} desembarcou com segurança!`,
            data: {
                action: PushNotificationAction.OPEN_ROUTE,
                passageiroId: (ctx.passageiroId || "") as string
            }
        };
    }
}
