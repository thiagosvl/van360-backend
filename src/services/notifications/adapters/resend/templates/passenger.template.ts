import { NotificationUrlBuilder } from "../../../utils/notification-url.builder.js";
import { NotificationContextFormatter } from "../../../utils/notification-context.formatter.js";
import { EmailComponents, ResendTemplateContext, ResendTemplatePayload, formatSubject } from "./components.js";

export class ResendPassengerTemplates {

    static contractAvailable(ctx: ResendTemplateContext): ResendTemplatePayload {
        const respFirstName = NotificationContextFormatter.getFirstName(ctx.nomeResponsavel, "Responsável");
        const passDisplayName = NotificationContextFormatter.getFirstAndLastName(ctx.nomePassageiro, "Aluno");
        const link = NotificationUrlBuilder.getContractSignatureUrl(
            (ctx.linkAssinatura || ctx.linkContrato || ctx.contratoUrl || ctx.token) as string | undefined
        );

        const subject = formatSubject(`Contrato pronto para assinatura: ${passDisplayName}`);
        const preheader = `O contrato de transporte escolar de ${passDisplayName} está disponível para assinatura online.`;
        const text = `Olá, ${respFirstName}!\n\nO contrato de transporte escolar de ${passDisplayName} está disponível para assinatura digital.\n\nAcesse o link para visualizar e assinar: ${link}\n\nAtenciosamente,\nEquipe Van360`;

        const contentHtml = `
            ${EmailComponents.greeting(respFirstName)}
            ${EmailComponents.paragraph(`O contrato de transporte escolar de <strong>${passDisplayName}</strong> já está pronto para assinatura digital.`)}
            ${EmailComponents.paragraph("A assinatura é rápida, segura e pode ser realizada em poucos segundos pelo celular ou computador.")}

            ${EmailComponents.button("Assinar Contrato Online", link)}
        `;

        const html = EmailComponents.layout({ subject, preheader, contentHtml });
        return { subject, html, text };
    }

    static contractSigned(ctx: ResendTemplateContext): ResendTemplatePayload {
        const respFirstName = NotificationContextFormatter.getFirstName(ctx.nomeResponsavel, "Responsável");
        const passDisplayName = NotificationContextFormatter.getFirstAndLastName(ctx.nomePassageiro, "Aluno");
        const link = NotificationUrlBuilder.getContractSignatureUrl(
            (ctx.contratoUrl || ctx.documentoFinalUrl || ctx.linkAssinatura || ctx.token) as string | undefined
        );

        const subject = formatSubject(`Contrato assinado com sucesso: ${passDisplayName}`);
        const preheader = `A cópia digital do contrato de transporte de ${passDisplayName} está disponível.`;
        const text = `Olá, ${respFirstName}!\n\nConfirmamos a assinatura digital do contrato de transporte escolar de ${passDisplayName}.\n\nVocê pode consultar e baixar sua cópia pelo link: ${link}\n\nAtenciosamente,\nEquipe Van360`;

        const contentHtml = `
            ${EmailComponents.greeting(respFirstName)}
            ${EmailComponents.paragraph(`Confirmamos a assinatura digital do contrato de transporte escolar de <strong>${passDisplayName}</strong>.`)}
            ${EmailComponents.paragraph("A sua via do documento já está disponível para consulta e download sempre que precisar.")}

            ${EmailComponents.button("Visualizar Contrato", link)}
        `;

        const html = EmailComponents.layout({ subject, preheader, contentHtml });
        return { subject, html, text };
    }

    static responsavelPinReset(ctx: ResendTemplateContext): ResendTemplatePayload {
        const respFirstName = NotificationContextFormatter.getFirstName(ctx.nomeResponsavel, "Responsável");
        const verificationCode = (ctx.codigo || ctx.pinCode || ctx.token) as string || "123456";

        const subject = formatSubject("Código para redefinir sua senha - Van360");
        const preheader = `Use o código ${verificationCode} para cadastrar sua nova senha no Van360.`;
        const text = `Olá, ${respFirstName}!\n\nRecebemos uma solicitação para cadastrar uma nova senha de acesso no Van360.\n\nSeu código de verificação: ${verificationCode}\n\nO código é válido por 15 minutos. Caso não tenha solicitado a alteração, desconsidere este e-mail.\n\nAtenciosamente,\nEquipe Van360`;

        const contentHtml = `
            ${EmailComponents.greeting(respFirstName)}
            ${EmailComponents.paragraph("Recebemos uma solicitação para cadastrar uma nova senha de acesso à carteirinha digital no <strong>Van360</strong>.")}
            ${EmailComponents.paragraph("Digite o código de verificação abaixo no aplicativo para continuar:")}

            ${EmailComponents.otpCard(verificationCode, "Código de Verificação")}

            ${EmailComponents.warningCard("⚠️ <strong>Aviso de Segurança:</strong> Este código expira em 15 minutos. Caso você não tenha solicitado esta alteração, ignore este e-mail e sua senha permanecerá a mesma.")}
        `;

        const html = EmailComponents.layout({ subject, preheader, contentHtml });
        return { subject, html, text };
    }
}
