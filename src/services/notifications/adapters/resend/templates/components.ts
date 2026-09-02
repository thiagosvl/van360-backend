import { NotificationUrlBuilder } from "../../../utils/notification-url.builder.js";
import { NotificationContextFormatter } from "../../../utils/notification-context.formatter.js";

export interface ResendTemplatePayload {
    subject: string;
    html: string;
    text: string;
}

export interface ResendTemplateContext {
    nome?: string;
    nomeMotorista?: string;
    nomeResponsavel?: string;
    nomePassageiro?: string;
    cpfLogin?: string;
    cpfcnpj?: string;
    senhaTemporaria?: string;
    codigoOtp?: string;
    token?: string;
    linkAssinatura?: string;
    linkContrato?: string;
    contratoUrl?: string;
    documentoFinalUrl?: string;
    isEngaged?: boolean;
    [key: string]: unknown;
}

export function formatSubject(subject: string): string {
    const isDev = process.env.NODE_ENV !== "production";
    if (isDev && !subject.startsWith("[DEV]")) {
        return `[DEV] ${subject}`;
    }
    return subject;
}

export function formatCpfDisplay(cpf: string): string {
    return NotificationContextFormatter.formatCpfCnpj(cpf);
}

/**
 * Componentes Modulares de E-mail (Design System & Compatibilidade)
 */
export class EmailComponents {
    /**
     * Saudação Padrão dos E-mails
     */
    static greeting(name: string): string {
        return `<div style="font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 12px;">Olá, ${name}!</div>`;
    }

    /**
     * Parágrafo de Texto Padrão
     */
    static paragraph(textHtml: string, marginBottom = 16): string {
        return `<p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 ${marginBottom}px 0;">${textHtml}</p>`;
    }

    /**
     * Card para Exibição de Credenciais / Informações em Destaque
     */
    static credentialsCard(items: Array<{ label: string; value: string; isMonospace?: boolean }>): string {
        const rowsHtml = items.map(item => {
            const valueStyle = item.isMonospace !== false
                ? "font-family: monospace; font-size: 15px; color: #1a3a5c; font-weight: 700;"
                : "font-size: 15px; color: #1a3a5c; font-weight: 700;";
            return `<div>• <strong>${item.label}:</strong> <span style="${valueStyle}">${item.value}</span></div>`;
        }).join("");

        return `
        <div style="font-size: 15px; color: #1e293b; line-height: 1.8; margin-bottom: 20px;">
            ${rowsHtml}
        </div>
        `;
    }

    /**
     * Bloco de Acesso Flexível (Badges Mobile Lado a Lado + Orientação Única para Navegador Web)
     */
    static accessButtonsBlock(): string {
        const appUrl = NotificationUrlBuilder.getBaseAppUrl();
        const playStoreUrl = NotificationUrlBuilder.getPlayStoreUrl();
        const playStoreBadgeUrl = NotificationUrlBuilder.getPlayStoreBadgeUrl();
        const appStoreUrl = NotificationUrlBuilder.getAppStoreUrl();
        const appStoreBadgeUrl = NotificationUrlBuilder.getAppStoreBadgeUrl();

        return `
        <div style="text-align: center; margin: 28px 0 12px 0;">
            <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 14px;">
                Baixe o App ou Acesse a sua Conta
            </div>

            <!-- Badges das Lojas de Aplicativos Mobile (Lado a Lado) -->
            <div style="text-align: center; margin-bottom: 14px;">
                <!-- Badge Google Play Store (Android) -->
                <a href="${playStoreUrl}" target="_blank" style="display: inline-block; text-decoration: none; margin: 4px 6px; vertical-align: middle;">
                    <img src="${playStoreBadgeUrl}" alt="Disponível no Google Play" height="52" style="height: 52px; width: auto; border: 0; outline: none; text-decoration: none; display: inline-block; vertical-align: middle;" />
                </a>

                ${appStoreUrl ? `
                <!-- Badge Apple App Store (iOS) -->
                <a href="${appStoreUrl}" target="_blank" style="display: inline-block; text-decoration: none; margin: 4px 6px; vertical-align: middle;">
                    <img src="${appStoreBadgeUrl}" alt="Baixar na App Store" height="52" style="height: 52px; width: auto; border: 0; outline: none; text-decoration: none; display: inline-block; vertical-align: middle;" />
                </a>
                ` : ""}
            </div>

            <!-- Orientação Única e Clara para Acesso Web -->
            <div style="font-size: 13px; color: #475569; line-height: 1.5; margin-top: 8px;">
                💻 <strong>Prefere não baixar agora ou utiliza computador / iPhone?</strong><br>
                Acesse a sua conta pelo navegador Web em <a href="${appUrl}" target="_blank" style="color: #1a3a5c; font-weight: 700; text-decoration: underline;">${appUrl}</a>.
            </div>
        </div>
        `;
    }

    /**
     * Cabeçalho Padrão com Fundo Claro (#ffffff) e Logo Van360
     */
    static header(): string {
        return `
        <div style="background-color: #ffffff; padding: 28px 24px 22px 24px; text-align: center; border-bottom: 1px solid #f1f5f9;">
            <img src="https://app.van360.com.br/assets/logo-van360.png" alt="Van360" width="140" border="0" style="display: block; width: 140px; height: auto; border: 0; outline: none; text-decoration: none; margin: 0 auto 8px auto;" />
            <p style="color: #475569; margin: 0; font-size: 11px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase;">Gestão Inteligente de Transporte Escolar</p>
        </div>
        `;
    }

    /**
     * Rodapé Padrão do E-mail
     */
    static footer(): string {
        return `
        <div style="background-color: #ffffff; padding: 20px; text-align: center; border-top: 1px solid #f1f5f9; font-size: 12px; color: #64748b; line-height: 1.6;">
            &copy; ${new Date().getFullYear()} <strong>Van360</strong> &bull; Aplicativo para Gestão de Transporte Escolar.<br>
            Este é um e-mail automático. Por favor, não responda.
        </div>
        `;
    }

    /**
     * Layout Base de E-mail
     */
    static layout({ subject, preheader, contentHtml }: { subject: string; preheader?: string; contentHtml: string }): string {
        return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>${subject}</title>
    <style>
        :root { color-scheme: light dark; supported-color-schemes: light dark; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px 12px; color: #1e293b; -webkit-font-smoothing: antialiased; }
        .container { max-width: 540px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0; }
        .content { padding: 32px 28px 24px 28px; background-color: #ffffff; }
    </style>
</head>
<body>
    ${preheader ? `<div style="display:none;font-size:1px;color:#333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${preheader}</div>` : ""}
    <div class="container">
        ${EmailComponents.header()}
        <div class="content">
            ${contentHtml}
        </div>
        ${EmailComponents.footer()}
    </div>
</body>
</html>
        `;
    }

    /**
     * Card para Exibição de Códigos e Senhas
     */
    static otpCard(code: string, label = "Seu Código de Verificação"): string {
        return `
        <div style="text-align: center; margin: 24px 0;">
            <div style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #1a3a5c; margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;">${code}</div>
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #64748b; margin-top: 6px; font-weight: 700;">${label}</div>
        </div>
        `;
    }

    /**
     * Botão de Ação CTA
     */
    static button(text: string, url: string): string {
        return `
        <div style="text-align: center; margin: 24px 0;">
            <a href="${url}" target="_blank" style="display: inline-block; background-color: #1a3a5c; color: #ffffff !important; font-weight: 600; font-size: 14px; padding: 13px 28px; border-radius: 10px; text-decoration: none;">${text}</a>
        </div>
        `;
    }

    static pixCopyPasteCard(pixCode: string): string {
        return `
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 14px; padding: 22px 20px; text-align: center; margin: 24px 0;">
            <div style="font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
                Pix Copia e Cola
            </div>
            <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 14px; font-weight: 700; color: #1a3a5c; background-color: #ffffff; border: 1px dashed #94a3b8; border-radius: 8px; padding: 12px 16px; display: inline-block; max-width: 100%; word-break: break-all; margin-bottom: 10px; user-select: all;">
                ${pixCode}
            </div>
            <div style="font-size: 12px; color: #64748b; font-weight: 500;">
                Copie o código Pix acima e cole no aplicativo do seu banco para pagar.
            </div>
        </div>
        `;
    }

    /**
     * Texto de Alerta / Segurança
     */
    static warningCard(textHtml: string): string {
        return `
        <div style="font-size: 13px; line-height: 1.5; color: #d97706; margin: 20px 0;">
            ${textHtml}
        </div>
        `;
    }
}
