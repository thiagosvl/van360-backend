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

    /**
     * 3. Redefinição de PIN do Responsável
     */
    static responsavelPinReset(ctx: ResendTemplateContext): ResendTemplatePayload {
        const respFirstName = NotificationContextFormatter.getFirstName(ctx.nomeResponsavel, "Responsável");
        const pinCode = (ctx.codigo || ctx.pinCode || ctx.token) as string || "123456";

        const subject = formatSubject("Redefinição de PIN de Acesso - Van360");
        const preheader = "Recebemos uma solicitação para redefinir seu PIN de acesso no Van360.";
        const text = `Olá, ${respFirstName}!\n\nRecebemos uma solicitação para redefinir o seu PIN de 4 dígitos no aplicativo Van360.\n\nSeu código de verificação é: ${pinCode}\n\nEste código expira em 15 minutos.\n\nAtenciosamente,\nEquipe Van360`;

        const contentHtml = `
            ${EmailComponents.greeting(respFirstName)}
            ${EmailComponents.paragraph("Recebemos uma solicitação para redefinir o seu PIN de 4 dígitos para acesso à carteirinha digital no <strong>Van360</strong>.")}
            ${EmailComponents.paragraph("Insira o código de verificação abaixo no aplicativo para redefinir sua senha:")}

            <div style="background-color: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 12px; padding: 18px; color: #1a3a5c; font-size: 28px; font-weight: 900; text-align: center; letter-spacing: 6px; margin: 24px 0;">
                ${pinCode}
            </div>

            ${EmailComponents.paragraph("<small style='color: #64748b;'>Este código é válido por 15 minutos. Se você não solicitou esta redefinição, por favor desconsidere este e-mail.</small>")}
        `;

        const html = EmailComponents.layout({ subject, preheader, contentHtml });
        return { subject, html, text };
    }
}
