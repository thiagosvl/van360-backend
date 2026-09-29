import { NotificationContextFormatter } from "../../../utils/notification-context.formatter.js";
import { EmailComponents, ResendTemplateContext, ResendTemplatePayload, formatSubject } from "./components.js";
import { PassageiroGenero, TipoChavePix } from "../../../../../types/enums.js";

const renderBillingSummaryCard = (items: Array<{ label: string; value: string; isHighlight?: boolean }>): string => {
    const rowsHtml = items.map(item => {
        if (item.isHighlight) {
            return `
                <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: baseline;">
                    <span style="font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">${item.label}</span>
                    <span style="font-size: 22px; font-weight: 800; color: #1a3a5c;">${item.value}</span>
                </div>
            `;
        }
        return `
            <div style="margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 13px; color: #64748b;">${item.label}</span>
                <span style="font-size: 14px; font-weight: 600; color: #1e293b;">${item.value}</span>
            </div>
        `;
    }).join("");

    return `
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; margin: 20px 0;">
            ${rowsHtml}
        </div>
    `;
};

const renderPixSection = (chavePix?: string, tipoChavePix?: string): string => {
    if (!chavePix || !chavePix.trim()) {
        return `
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 20px; text-align: center; margin: 20px 0;">
                <p style="margin: 0; font-size: 13px; font-weight: 500; color: #475569;">
                    Entre em contato com o motorista para obter os dados de pagamento ou regularizar a parcela.
                </p>
            </div>
        `;
    }

    const { key: chaveFormatada, typeLabel } = NotificationContextFormatter.formatPixKey(chavePix, tipoChavePix);

    return `
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 14px; padding: 20px; text-align: center; margin: 20px 0;">
            <div style="font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
                Chave Pix (${typeLabel})
            </div>
            <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 16px; font-weight: 800; color: #1a3a5c; background-color: #ffffff; border: 1px dashed #94a3b8; border-radius: 8px; padding: 12px 16px; display: inline-block; max-width: 100%; word-break: break-all; margin-bottom: 8px; user-select: all; -webkit-user-select: all; cursor: pointer;">
                ${chaveFormatada}
            </div>
            <div style="font-size: 12px; color: #64748b; font-weight: 500;">
                Toque ou selecione a chave Pix acima para copiar e pagar no app do seu banco.
            </div>
        </div>
    `;
};

export class ResendPassengerBillingTemplates {

    static dueSoon(ctx: ResendTemplateContext): ResendTemplatePayload {
        const respFirstName = NotificationContextFormatter.getFirstName(ctx.nomeResponsavel, "Responsável");
        const passDisplayName = NotificationContextFormatter.getFirstAndLastName(ctx.nomePassageiro, "Aluno");
        const valorStr = NotificationContextFormatter.formatValue(Number(ctx.valor) || 0);
        const dataVencStr = NotificationContextFormatter.formatDate((ctx.dataVencimento as string) || "");
        const mesName = ctx.mes ? NotificationContextFormatter.getMonthLabel(ctx.mes as number) : "";
        const diasAntecedencia = ctx.diasAntecedencia as number | undefined;

        const prazoTexto = diasAntecedencia && diasAntecedencia > 0
            ? (diasAntecedencia === 1 ? "vence amanhã" : `vence em ${diasAntecedencia} dias`)
            : `vence em ${dataVencStr}`;

        const subject = formatSubject(`Lembrete: Parcela de ${passDisplayName} ${prazoTexto}`);
        const preheader = `A parcela de transporte escolar de ${passDisplayName} (${valorStr}) ${prazoTexto} (${dataVencStr}).`;
        
        const chavePix = ctx.chavePix as string | undefined;
        const tipoChavePix = ctx.tipoChavePix as string | undefined;

        const contentHtml = `
            ${EmailComponents.greeting(respFirstName)}
            ${EmailComponents.paragraph(`Lembramos que a parcela de transporte de <strong>${passDisplayName}</strong> <strong>${prazoTexto}</strong> (${dataVencStr}).`)}
            
            ${renderBillingSummaryCard([
                { label: "Aluno", value: passDisplayName },
                ...(mesName ? [{ label: "Mês de Referência", value: mesName }] : []),
                { label: "Vencimento", value: `${dataVencStr} (${prazoTexto})` },
                { label: "Valor", value: valorStr, isHighlight: true }
            ])}

            ${renderPixSection(chavePix, tipoChavePix)}

            ${EmailComponents.paragraph("<small style='color: #64748b;'>Caso já tenha efetuado o pagamento, por favor desconsidere este aviso.</small>")}
        `;

        const text = `Olá, ${respFirstName}!\n\nLembramos que a parcela de transporte escolar de ${passDisplayName} ${prazoTexto} (${dataVencStr}) no valor de ${valorStr}.\n\nCaso já tenha efetuado o pagamento, desconsidere este aviso.\n\nAtenciosamente,\nVan360`;
        const html = EmailComponents.layout({ subject, preheader, contentHtml });

        return { subject, html, text };
    }

    static dueToday(ctx: ResendTemplateContext): ResendTemplatePayload {
        const respFirstName = NotificationContextFormatter.getFirstName(ctx.nomeResponsavel, "Responsável");
        const passDisplayName = NotificationContextFormatter.getFirstAndLastName(ctx.nomePassageiro, "Aluno");
        const valorStr = NotificationContextFormatter.formatValue(Number(ctx.valor) || 0);
        const mesName = ctx.mes ? NotificationContextFormatter.getMonthLabel(ctx.mes as number) : "";

        const subject = formatSubject(`Vence hoje: parcela de transporte de ${passDisplayName}`);
        const preheader = `A parcela de transporte de ${passDisplayName} (${valorStr}) tem vencimento programado para hoje.`;

        const chavePix = ctx.chavePix as string | undefined;
        const tipoChavePix = ctx.tipoChavePix as string | undefined;

        const contentHtml = `
            ${EmailComponents.greeting(respFirstName)}
            ${EmailComponents.paragraph(`Informamos que a parcela de transporte de <strong>${passDisplayName}</strong> <strong>vence hoje</strong>.`)}
            
            ${renderBillingSummaryCard([
                { label: "Aluno", value: passDisplayName },
                ...(mesName ? [{ label: "Mês de Referência", value: mesName }] : []),
                { label: "Vencimento", value: "Hoje" },
                { label: "Valor", value: valorStr, isHighlight: true }
            ])}

            ${renderPixSection(chavePix, tipoChavePix)}

            ${EmailComponents.paragraph("<small style='color: #64748b;'>Caso já tenha efetuado o pagamento, por favor desconsidere este aviso.</small>")}
        `;

        const text = `Olá, ${respFirstName}!\n\nInformamos que a parcela de transporte escolar de ${passDisplayName} vence hoje no valor de ${valorStr}.\n\nCaso já tenha efetuado o pagamento, desconsidere este aviso.\n\nAtenciosamente,\nVan360`;
        const html = EmailComponents.layout({ subject, preheader, contentHtml });

        return { subject, html, text };
    }

    static overdue(ctx: ResendTemplateContext): ResendTemplatePayload {
        const respFirstName = NotificationContextFormatter.getFirstName(ctx.nomeResponsavel, "Responsável");
        const passDisplayName = NotificationContextFormatter.getFirstAndLastName(ctx.nomePassageiro, "Aluno");
        const valorStr = NotificationContextFormatter.formatValue(Number(ctx.valor) || 0);
        const dataVencStr = NotificationContextFormatter.formatDate((ctx.dataVencimento as string) || "");
        const mesName = ctx.mes ? NotificationContextFormatter.getMonthLabel(ctx.mes as number) : "";
        const diasAtraso = Number(ctx.diasAtraso) || 0;

        const diasRotulo = diasAtraso === 1 ? "1 dia" : `${diasAtraso} dias`;
        const atrasoTexto = diasAtraso > 0
            ? `vencida há <strong>${diasRotulo}</strong> (${dataVencStr})`
            : `vencida em ${dataVencStr}`;

        const subject = formatSubject(`Parcela pendente: transporte de ${passDisplayName}`);
        const preheader = `Consta uma parcela pendente de transporte de ${passDisplayName} (${valorStr}) vencida em ${dataVencStr}.`;

        const chavePix = ctx.chavePix as string | undefined;
        const tipoChavePix = ctx.tipoChavePix as string | undefined;

        const contentHtml = `
            ${EmailComponents.greeting(respFirstName)}
            ${EmailComponents.paragraph(`Identificamos que a parcela de transporte escolar de <strong>${passDisplayName}</strong> consta como pendente de pagamento (${atrasoTexto}).`)}
            
            ${renderBillingSummaryCard([
                { label: "Aluno", value: passDisplayName },
                ...(mesName ? [{ label: "Mês de Referência", value: mesName }] : []),
                { label: "Vencimento Original", value: dataVencStr },
                { label: "Situação", value: diasAtraso > 0 ? `Em atraso há ${diasRotulo}` : "Pendente" },
                { label: "Valor", value: valorStr, isHighlight: true }
            ])}

            ${renderPixSection(chavePix, tipoChavePix)}

            ${EmailComponents.paragraph("<small style='color: #64748b;'>Caso o pagamento já tenha sido realizado nas últimas horas, por favor desconsidere este e-mail.</small>")}
        `;

        const text = `Olá, ${respFirstName}!\n\nIdentificamos que a parcela de transporte de ${passDisplayName} no valor de ${valorStr} consta como pendente (${diasAtraso > 0 ? `vencida há ${diasRotulo}` : `vencida em ${dataVencStr}`}).\n\nCaso o pagamento já tenha sido realizado, por favor desconsidere este aviso.\n\nAtenciosamente,\nVan360`;
        const html = EmailComponents.layout({ subject, preheader, contentHtml });

        return { subject, html, text };
    }
}
