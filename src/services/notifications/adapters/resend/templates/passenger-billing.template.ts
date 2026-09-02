import { formatCurrency, maskCpf, maskCnpj, maskPhone } from "../../../../../utils/format.js";
import { formatToBrazilianDate, getMonthNameBR } from "../../../../../utils/date.utils.js";
import { NotificationContextFormatter } from "../../../utils/notification-context.formatter.js";
import { EmailComponents, ResendTemplateContext, ResendTemplatePayload, formatSubject } from "./components.js";

const getTipoChavePixLabel = (tipo?: string): string => {
    if (!tipo) return "Chave Pix";
    const mapping: Record<string, string> = {
        CPF: "Chave Pix (CPF)",
        CNPJ: "Chave Pix (CNPJ)",
        EMAIL: "Chave Pix (E-mail)",
        TELEFONE: "Chave Pix (Telefone)",
        ALEATORIA: "Chave Pix (Aleatória)"
    };
    return mapping[tipo.toUpperCase()] || `Chave Pix (${tipo})`;
};

const formatChavePix = (chave: string, tipo?: string): string => {
    if (!tipo) return chave;
    const t = tipo.toUpperCase();
    if (t === "CPF") return maskCpf(chave);
    if (t === "CNPJ") return maskCnpj(chave);
    if (t === "TELEFONE") return maskPhone(chave);
    return chave;
};

const renderPixSection = (chavePix?: string, tipoChavePix?: string): string => {
    if (!chavePix || !chavePix.trim()) {
        return `
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; text-align: center; margin: 24px 0;">
                <p style="margin: 0; font-size: 14px; font-weight: 600; color: #475569;">
                    Entre em contato com o motorista para obter os dados de pagamento ou regularizar a parcela.
                </p>
            </div>
        `;
    }

    const tipoLabel = getTipoChavePixLabel(tipoChavePix);
    const chaveFormatada = formatChavePix(chavePix.trim(), tipoChavePix);

    return `
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 14px; padding: 22px 20px; text-align: center; margin: 24px 0;">
            <div style="font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
                ${tipoLabel}
            </div>
            <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 17px; font-weight: 800; color: #1a3a5c; background-color: #ffffff; border: 1px dashed #94a3b8; border-radius: 8px; padding: 12px 16px; display: inline-block; max-width: 100%; word-break: break-all; margin-bottom: 10px; user-select: all;">
                ${chaveFormatada}
            </div>
            <div style="font-size: 12px; color: #64748b; font-weight: 500;">
                Copie a chave Pix acima para pagar no aplicativo do seu banco.
            </div>
        </div>
    `;
};

export class ResendPassengerBillingTemplates {

    static dueSoon(ctx: ResendTemplateContext): ResendTemplatePayload {
        const respFirstName = NotificationContextFormatter.getFirstName(ctx.nomeResponsavel, "Responsável");
        const passDisplayName = NotificationContextFormatter.getFirstAndLastName(ctx.nomePassageiro, "Aluno");
        const valorStr = formatCurrency(Number(ctx.valor) || 0);
        const dataVencStr = formatToBrazilianDate((ctx.dataVencimento as string) || "");
        const mesName = getMonthNameBR(ctx.mes as number);
        const refMesStr = mesName ? ` referente ao mês de <strong>${mesName}</strong>` : "";
        const diasAntecedencia = ctx.diasAntecedencia as number | undefined;

        const prazoTexto = diasAntecedencia && diasAntecedencia > 0
            ? (diasAntecedencia === 1 ? "vence amanhã" : `vence em ${diasAntecedencia} dias (${dataVencStr})`)
            : `vence em ${dataVencStr}`;

        const subject = formatSubject(`Lembrete: Parcela de ${passDisplayName} vence em ${dataVencStr}`);
        const preheader = `A parcela de transporte escolar de ${passDisplayName} (${valorStr}) ${prazoTexto}.`;
        
        const chavePix = ctx.chavePix as string | undefined;
        const tipoChavePix = ctx.tipoChavePix as string | undefined;

        const contentHtml = `
            ${EmailComponents.greeting(respFirstName)}
            ${EmailComponents.paragraph(`Lembramos que a parcela do transporte escolar de <strong>${passDisplayName}</strong>${refMesStr} <strong>${prazoTexto}</strong> no valor de <strong>${valorStr}</strong>.`)}
            
            ${renderPixSection(chavePix, tipoChavePix)}

            ${EmailComponents.paragraph("<small style='color: #64748b;'>Caso já tenha efetuado o pagamento, por favor desconsidere este aviso.</small>")}
        `;

        const text = `Olá, ${respFirstName}!\n\nLembramos que a parcela do transporte escolar de ${passDisplayName} vence em ${dataVencStr} no valor de ${valorStr}.\n\nAtenciosamente,\nVan360`;
        const html = EmailComponents.layout({ subject, preheader, contentHtml });

        return { subject, html, text };
    }

    static dueToday(ctx: ResendTemplateContext): ResendTemplatePayload {
        const respFirstName = NotificationContextFormatter.getFirstName(ctx.nomeResponsavel, "Responsável");
        const passDisplayName = NotificationContextFormatter.getFirstAndLastName(ctx.nomePassageiro, "Aluno");
        const valorStr = formatCurrency(Number(ctx.valor) || 0);
        const mesName = getMonthNameBR(ctx.mes as number);
        const refMesStr = mesName ? ` referente ao mês de <strong>${mesName}</strong>` : "";

        const subject = formatSubject(`Aviso: A parcela de ${passDisplayName} vence hoje`);
        const preheader = `Hoje é a data de vencimento da parcela de transporte escolar de ${passDisplayName} (${valorStr}).`;

        const chavePix = ctx.chavePix as string | undefined;
        const tipoChavePix = ctx.tipoChavePix as string | undefined;

        const contentHtml = `
            ${EmailComponents.greeting(respFirstName)}
            ${EmailComponents.paragraph(`Informamos que a parcela do transporte escolar de <strong>${passDisplayName}</strong>${refMesStr} <strong>vence hoje</strong> no valor de <strong>${valorStr}</strong>.`)}
            ${EmailComponents.paragraph("Por favor, efetue o pagamento hoje para manter o transporte escolar em dia.")}

            ${renderPixSection(chavePix, tipoChavePix)}

            ${EmailComponents.paragraph("<small style='color: #64748b;'>Caso já tenha efetuado o pagamento, por favor desconsidere este aviso.</small>")}
        `;

        const text = `Olá, ${respFirstName}!\n\nInformamos que a parcela do transporte escolar de ${passDisplayName} vence hoje no valor de ${valorStr}.\n\nAtenciosamente,\nVan360`;
        const html = EmailComponents.layout({ subject, preheader, contentHtml });

        return { subject, html, text };
    }

    static overdue(ctx: ResendTemplateContext): ResendTemplatePayload {
        const respFirstName = NotificationContextFormatter.getFirstName(ctx.nomeResponsavel, "Responsável");
        const passDisplayName = NotificationContextFormatter.getFirstAndLastName(ctx.nomePassageiro, "Aluno");
        const valorStr = formatCurrency(Number(ctx.valor) || 0);
        const dataVencStr = formatToBrazilianDate((ctx.dataVencimento as string) || "");
        const mesName = getMonthNameBR(ctx.mes as number);
        const refMesStr = mesName ? ` referente ao mês de <strong>${mesName}</strong>` : "";
        const diasAtraso = Number(ctx.diasAtraso) || 0;

        const diasRotulo = diasAtraso === 1 ? "1 dia" : `${diasAtraso} dias`;
        const atrasoTexto = diasAtraso > 0
            ? `está em atraso há <strong>${diasRotulo}</strong> (vencimento em ${dataVencStr})`
            : `está pendente de pagamento (vencimento em ${dataVencStr})`;

        const subject = formatSubject(`Atenção: Parcela de ${passDisplayName} em atraso`);
        const preheader = `A parcela de transporte escolar de ${passDisplayName} está em atraso (${valorStr}).`;

        const chavePix = ctx.chavePix as string | undefined;
        const tipoChavePix = ctx.tipoChavePix as string | undefined;

        const acaoTexto = chavePix && chavePix.trim()
            ? "Por favor, efetue o pagamento para manter o transporte em dia."
            : "Entre em contato com o motorista o quanto antes para regularizar o pagamento.";

        const contentHtml = `
            ${EmailComponents.greeting(respFirstName)}
            ${EmailComponents.paragraph(`Identificamos que a parcela do transporte escolar de <strong>${passDisplayName}</strong>${refMesStr} ${atrasoTexto} no valor de <strong>${valorStr}</strong>.`)}
            ${EmailComponents.paragraph(acaoTexto)}

            ${renderPixSection(chavePix, tipoChavePix)}

            ${EmailComponents.paragraph("<small style='color: #64748b;'>Caso o pagamento já tenha sido realizado nas últimas horas, por favor desconsidere este e-mail.</small>")}
        `;

        const text = `Olá, ${respFirstName}!\n\nIdentificamos que a parcela do transporte escolar de ${passDisplayName} está em atraso no valor de ${valorStr}.\n\nAtenciosamente,\nVan360`;
        const html = EmailComponents.layout({ subject, preheader, contentHtml });

        return { subject, html, text };
    }
}
