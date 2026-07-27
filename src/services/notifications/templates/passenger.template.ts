import { formatToBrazilianDate, getMonthNameBR } from "../../../utils/date.utils.js";
import { formatCurrency, getFirstAndSecondName, getFirstName, maskCpf, maskCnpj, maskPhone } from "../../../utils/format.js";
import { CompositeMessagePart } from "../../../types/dtos/whatsapp.dto.js";

export interface PassengerContext {
    nomeResponsavel: string;
    nomePassageiro: string;
    nomeMotorista: string;
    valor?: number;
    dataVencimento?: string;
    diasAntecedencia?: number;
    diasAtraso?: number;
    linkPagamento?: string;
    mes?: number;
    ano?: number;
    usuarioId: string;
    apelidoMotorista?: string;
    reciboUrl?: string;
    telefoneMotorista?: string;
    linkAssinatura?: string;
    contratoUrl?: string;
    chavePix?: string;
    tipoChavePix?: string;
}

const textPart = (text: string): CompositeMessagePart[] => {
    return [{ type: "text", content: text }];
};

const getParcelaTitle = (nomePassageiro: string, mes?: number): string => {
    const mesLabel = getMonthNameBR(mes);
    return mesLabel
        ? `Parcela ${mesLabel} — ${nomePassageiro}`
        : `Parcela — ${nomePassageiro}`;
};

const getParcelaBody = (nomePassageiro: string, mes?: number): string => {
    const mesLabel = getMonthNameBR(mes).toLowerCase();
    return mesLabel
        ? `parcela de *${mesLabel}* de *${getFirstName(nomePassageiro)}*`
        : `parcela de *${getFirstName(nomePassageiro)}*`;
};

const getTipoChavePixLabel = (tipo?: string): string => {
    if (!tipo) return "";
    const mapping: Record<string, string> = {
        CPF: "CPF",
        CNPJ: "CNPJ",
        EMAIL: "E-mail",
        TELEFONE: "Telefone",
        ALEATORIA: "Chave Aleatória"
    };
    return mapping[tipo.toUpperCase()] || tipo;
};

const getSystemFooter = (ctx: PassengerContext) => {
    const nomeExibicao = ctx.apelidoMotorista || getFirstAndSecondName(ctx.nomeMotorista);
    return `\n\n———\n🚐 *${nomeExibicao}* · Van360`;
};

const buildPixParts = (mainText: string, chavePix: string, tipoChavePix: string | undefined, ctx: PassengerContext): CompositeMessagePart[] => {
    const labelTipo = getTipoChavePixLabel(tipoChavePix);
    const tipoStr = labelTipo ? ` (${labelTipo})` : "";

    let chaveFormatada = chavePix;
    if (tipoChavePix) {
        const t = tipoChavePix.toUpperCase();
        if (t === "CPF") chaveFormatada = maskCpf(chavePix);
        else if (t === "CNPJ") chaveFormatada = maskCnpj(chavePix);
        else if (t === "TELEFONE") chaveFormatada = maskPhone(chavePix);
    }

    return [
        { type: "text", content: mainText },
        { type: "text", content: chaveFormatada },
        { type: "text", content: `_Copie a chave Pix${tipoStr} acima e pague pelo app do seu banco._${getSystemFooter(ctx)}` }
    ];
};

export const PassengerTemplates = {

    contractAvailable: (ctx: PassengerContext): CompositeMessagePart[] => {
        const linkStr = ctx.linkAssinatura ? `\n\n👉 Leia e assine aqui: ${ctx.linkAssinatura}` : "";
        const text = `📄 *Contrato de transporte disponível*\n\n` +
            `${getFirstName(ctx.nomeResponsavel)}, o contrato de prestação de serviços do *${getFirstName(ctx.nomePassageiro)}* já está pronto para assinatura digital.\n\n` +
            `💡 _A assinatura é rápida, feita pelo celular e garante a vaga e a segurança do transporte._${linkStr}${getSystemFooter(ctx)}`;
        return textPart(text);
    },

    contractSignedBySelf: (ctx: PassengerContext): CompositeMessagePart[] => {
        const linkStr = ctx.contratoUrl ? `\n\n📄 Veja o contrato: ${ctx.contratoUrl}` : "";
        const text = `✅ *Contrato assinado — ${getFirstName(ctx.nomePassageiro)}*\n\n` +
            `${getFirstName(ctx.nomeResponsavel)}, o contrato de transporte foi assinado com sucesso.${linkStr}${getSystemFooter(ctx)}`;
        return textPart(text);
    },

    dueSoon: (ctx: PassengerContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor || 0);
        const data = formatToBrazilianDate(ctx.dataVencimento || "");
        const diasMsg = ctx.diasAntecedencia ? ` (daqui a ${ctx.diasAntecedencia} dias)` : "";
        const titulo = getParcelaTitle(ctx.nomePassageiro, ctx.mes);
        const corpo = getParcelaBody(ctx.nomePassageiro, ctx.mes);

        if (ctx.chavePix) {
            const mainText = `🗓️ *${titulo}*\n\n` +
                `${getFirstName(ctx.nomeResponsavel)}, lembrete da ${corpo}.\n\n` +
                // `🔹 Valor: *${valor}*\n` +
                `🔹 Vencimento: *${data}*${diasMsg}\n` +
                `⚠️ Lembre-se de pagar até a data de vencimento para evitar a cobrança de multas e juros.\n\n` +
                `Segue a chave Pix para pagamento:`;
            return buildPixParts(mainText, ctx.chavePix, ctx.tipoChavePix, ctx);
        }

        const text = `🗓️ *${titulo}*\n\n` +
            `${getFirstName(ctx.nomeResponsavel)}, lembrete da ${corpo}.\n\n` +
            // `🔹 Valor: *${valor}*\n` +
            `🔹 Vencimento: *${data}*${diasMsg}\n` +
            `⚠️ Lembre-se de pagar até a data de vencimento para evitar a cobrança de multas e juros.${getSystemFooter(ctx)}`;
        return textPart(text);
    },

    dueToday: (ctx: PassengerContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor || 0);
        const data = formatToBrazilianDate(ctx.dataVencimento || "");
        const titulo = getParcelaTitle(ctx.nomePassageiro, ctx.mes);
        const corpo = getParcelaBody(ctx.nomePassageiro, ctx.mes);

        if (ctx.chavePix) {
            const mainText = `⚠️ *${titulo} — vence hoje*\n\n` +
                `${getFirstName(ctx.nomeResponsavel)}, a ${corpo} vence hoje!\n\n` +
                // `🔹 Valor: *${valor}*\n` +
                `🔹 Vencimento: *${data}*\n` +
                `⚠️ Realize o pagamento hoje para evitar a cobrança de multas e juros.\n\n` +
                `Segue a chave Pix para pagamento:`;
            return buildPixParts(mainText, ctx.chavePix, ctx.tipoChavePix, ctx);
        }

        const text = `⚠️ *${titulo} — vence hoje*\n\n` +
            `${getFirstName(ctx.nomeResponsavel)}, a ${corpo} vence hoje!\n\n` +
            // `🔹 Valor: *${valor}*\n` +
            `🔹 Vencimento: *${data}*\n` +
            `⚠️ Realize o pagamento hoje para evitar a cobrança de multas e juros.${getSystemFooter(ctx)}`;
        return textPart(text);
    },

    overdue: (ctx: PassengerContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor || 0);
        const data = formatToBrazilianDate(ctx.dataVencimento || "");
        const titulo = getParcelaTitle(ctx.nomePassageiro, ctx.mes);
        const corpo = getParcelaBody(ctx.nomePassageiro, ctx.mes);

        const diasStr = ctx.diasAtraso ? ` (há ${ctx.diasAtraso} dias)` : "";
        const introStr = ctx.diasAtraso
            ? `consta em nosso sistema que a ${corpo} está atrasada há ${ctx.diasAtraso} dias.`
            : `consta em nosso sistema que a ${corpo} ainda está pendente.`;

        if (ctx.chavePix) {
            const mainText = `🚨 *${titulo} — em atraso*\n\n` +
                `${getFirstName(ctx.nomeResponsavel)}, ${introStr}\n\n` +
                // `🔹 Valor pendente: *${valor}*\n` +
                `🔹 Vencida em: *${data}*\n` +
                `⚠️ *Importante:* O atraso no pagamento pode gerar cobrança de multas e juros, caso aplicável.\n\n` +
                `Segue a chave Pix para pagamento:`;
            return buildPixParts(mainText, ctx.chavePix, ctx.tipoChavePix, ctx);
        }

        const text = `🚨 *${titulo} — em atraso*\n\n` +
            `${getFirstName(ctx.nomeResponsavel)}, ${introStr}\n\n` +
            // `🔹 Valor pendente: *${valor}*\n` +
            `🔹 Vencida em: *${data}*\n` +
            `⚠️ *Importante:* O atraso no pagamento pode gerar cobrança de multas e juros, caso aplicável.${getSystemFooter(ctx)}`;
        return textPart(text);
    }
};

