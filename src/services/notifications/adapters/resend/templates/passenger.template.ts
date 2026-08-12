import { NotificationUrlBuilder } from "../../../utils/notification-url.builder.js";
import { NotificationContextFormatter } from "../../../utils/notification-context.formatter.js";
import { EmailComponents, ResendTemplateContext, ResendTemplatePayload, formatSubject } from "./components.js";

/**
 * Templates de E-mail para Pais e Responsáveis
 */
export class ResendPassengerTemplates {

    /**
     * 1. Contrato Disponível para Assinatura
     */
    static contractAvailable(ctx: ResendTemplateContext): ResendTemplatePayload {
        const respFirstName = NotificationContextFormatter.getFirstName(ctx.nomeResponsavel, "Responsável");
        const passDisplayName = NotificationContextFormatter.getFirstAndLastName(ctx.nomePassageiro, "Passageiro");
        const link = NotificationUrlBuilder.getContractSignatureUrl(
            (ctx.linkAssinatura || ctx.linkContrato || ctx.contratoUrl || ctx.token) as string | undefined
        );

        const subject = formatSubject(`Contrato de Transporte Escolar - ${passDisplayName}`);
        const preheader = `O contrato de prestação de serviços do passageiro ${passDisplayName} está pronto para assinatura.`;
        const text = `Olá, ${respFirstName}!\n\nO contrato de prestação de serviços de transporte escolar do passageiro ${passDisplayName} está disponível para assinatura digital.\n\nAcesse: ${link}\n\nAtenciosamente,\nEquipe Van360`;

        const contentHtml = `
            ${EmailComponents.greeting(respFirstName)}
            ${EmailComponents.paragraph(`O contrato de prestação de serviços de transporte escolar do passageiro <strong>${passDisplayName}</strong> já está disponível para assinatura digital.`)}
            ${EmailComponents.paragraph("A assinatura é feita em poucos segundos pelo seu celular ou computador.")}

            ${EmailComponents.button("Visualizar e Assinar Contrato", link)}
        `;

        const html = EmailComponents.layout({ subject, preheader, contentHtml });
        return { subject, html, text };
    }

    /**
     * 2. Contrato Assinado com Sucesso
     */
    static contractSigned(ctx: ResendTemplateContext): ResendTemplatePayload {
        const respFirstName = NotificationContextFormatter.getFirstName(ctx.nomeResponsavel, "Responsável");
        const passDisplayName = NotificationContextFormatter.getFirstAndLastName(ctx.nomePassageiro, "Passageiro");
        const link = NotificationUrlBuilder.getContractSignatureUrl(
            (ctx.contratoUrl || ctx.documentoFinalUrl || ctx.linkAssinatura || ctx.token) as string | undefined
        );

        const subject = formatSubject(`Contrato Assinado - ${passDisplayName}`);
        const preheader = `Seu contrato de transporte escolar para ${passDisplayName} foi assinado digitalmente.`;
        const text = `Olá, ${respFirstName}!\n\nConfirmamos a assinatura digital do contrato de transporte escolar do passageiro ${passDisplayName}.\n\nVocê pode visualizar e baixar a cópia do contrato aqui: ${link}\n\nAtenciosamente,\nEquipe Van360`;

        const contentHtml = `
            ${EmailComponents.greeting(respFirstName)}
            ${EmailComponents.paragraph(`O contrato de transporte escolar do passageiro <strong>${passDisplayName}</strong> foi assinado com sucesso.`)}

            ${EmailComponents.button("Visualizar Contrato Assinado", link)}
        `;

        const html = EmailComponents.layout({ subject, preheader, contentHtml });
        return { subject, html, text };
    }
}
