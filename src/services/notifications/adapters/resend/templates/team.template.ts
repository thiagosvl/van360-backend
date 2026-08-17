import { NotificationContextFormatter } from "../../../utils/notification-context.formatter.js";
import { EmailComponents, ResendTemplateContext, ResendTemplatePayload, formatCpfDisplay, formatSubject } from "./components.js";

/**
 * Templates de E-mail para Equipe, Monitores e Ajudantes
 */
export class ResendTeamTemplates {

    /**
     * 1. Cadastro de Ajudante / Monitor da Equipe
     */
    static teamMemberCreated(ctx: ResendTemplateContext): ResendTemplatePayload {
        const nome = NotificationContextFormatter.getFirstName(ctx.nomeMotorista || ctx.nome, "Membro da Equipe");
        const cpf = formatCpfDisplay((ctx.cpfLogin || ctx.cpfcnpj || "") as string);
        const senha = (ctx.senhaTemporaria || "") as string;

        const subject = formatSubject("Bem-vindo à Equipe");
        const preheader = `Você foi adicionado à equipe no Van360. Veja suas credenciais de acesso.`;
        const text = `Olá, ${nome}!\n\nVocê foi cadastrado no Van360.\n\nCPF (Login): ${cpf}\nSenha Temporária: ${senha}\n\nRecomendamos alterar sua senha no primeiro acesso.\n\nAtenciosamente,\nEquipe Van360`;

        const contentHtml = `
            ${EmailComponents.greeting(nome)}
            ${EmailComponents.paragraph("Você foi cadastrado como membro da equipe no <strong>Van360</strong>.", 20)}
            
            ${EmailComponents.credentialsCard([
            { label: "CPF (Login)", value: cpf, isMonospace: true },
            { label: "Senha", value: senha, isMonospace: true }
        ])}

            ${EmailComponents.warningCard("💡 <strong>Aviso de Segurança:</strong> Por motivos de segurança, altere sua senha temporária no primeiro acesso em <strong>Configurações > Meu Perfil</strong>.")}

            ${EmailComponents.accessButtonsBlock()}
        `;

        const html = EmailComponents.layout({ subject, preheader, contentHtml });
        return { subject, html, text };
    }

    /**
     * 2. Reset de Senha do Ajudante / Monitor
     */
    static teamMemberResetPassword(ctx: ResendTemplateContext): ResendTemplatePayload {
        const nome = NotificationContextFormatter.getFirstName(ctx.nomeMotorista || ctx.nome, "Membro da Equipe");
        const senha = (ctx.senhaTemporaria || "") as string;

        const subject = formatSubject("Nova Senha de Acesso");
        const preheader = `Sua senha de acesso à equipe no Van360 foi redefinida.`;
        const text = `Olá, ${nome}!\n\nSua senha temporária de acesso ao Van360 é: ${senha}\n\nAtenciosamente,\nEquipe Van360`;

        const contentHtml = `
            ${EmailComponents.greeting(nome)}
            ${EmailComponents.paragraph("Sua senha de acesso à equipe no <strong>Van360</strong> foi redefinida pelo gestor.")}
            
            ${EmailComponents.otpCard(senha, "Sua Nova Senha Temporária")}

            ${EmailComponents.warningCard("💡 <strong>Aviso de Segurança:</strong> Por motivos de segurança, altere sua senha temporária após o login em <strong>Configurações > Meu Perfil</strong>.")}

            ${EmailComponents.accessButtonsBlock()}
        `;

        const html = EmailComponents.layout({ subject, preheader, contentHtml });
        return { subject, html, text };
    }

    /**
     * 3. Status da Conta do Ajudante Alterado (Ativado / Desativado)
     */
    static teamMemberStatusChanged(ctx: ResendTemplateContext): ResendTemplatePayload {
        const nome = NotificationContextFormatter.getFirstName(ctx.nomeMotorista || ctx.nome, "Membro da Equipe");
        const isEngaged = ctx.isEngaged !== false;
        const statusText = isEngaged ? "ativada" : "desativada";

        const subject = formatSubject(`Status da sua Conta`);
        const preheader = `Sua conta do Van360 foi ${statusText}.`;
        const text = `Olá, ${nome}!\n\nSua conta do Van360 foi ${statusText}.\n\nAtenciosamente,\nEquipe Van360`;

        const contentHtml = `
            ${EmailComponents.greeting(nome)}
            ${EmailComponents.paragraph(`Informamos que a sua conta no <strong>Van360</strong> foi <strong>${statusText}</strong>.`)}
            
            ${isEngaged ? `
            ${EmailComponents.paragraph("Seu acesso foi reativado e você já pode utilizar o aplicativo normalmente.", 20)}
            ${EmailComponents.accessButtonsBlock()}
            ` : `
            <p style="font-size: 14px; line-height: 1.6; color: #64748b; margin: 0;">Se você tiver dúvidas sobre essa alteração, por favor entre em contato com o responsável pela sua frota.</p>
            `}
        `;

        const html = EmailComponents.layout({ subject, preheader, contentHtml });
        return { subject, html, text };
    }
}
