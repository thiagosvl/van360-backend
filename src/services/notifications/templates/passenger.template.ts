import { formatToBrazilianDate } from "../../../utils/date.utils.js";
import { formatCurrency, getFirstName } from "../../../utils/format.js";
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
    const phoneLink = ctx.telefoneMotorista
        ? `\n📞 https://wa.me/55${ctx.telefoneMotorista.replace(/\D/g, "")}`
        : "";
    const nomeExibicao = ctx.apelidoMotorista || getFirstName(ctx.nomeMotorista);
    return `\n\n———\n🚐 *${nomeExibicao}* · Van360${phoneLink}`;
};

const getPixBlock = (ctx: PassengerContext): string => {
    if (!ctx.chavePix) return "";
    const labelTipo = getTipoChavePixLabel(ctx.tipoChavePix);
    return `\n\n💳 *Pix para pagamento:*\nChave (${labelTipo}): ${ctx.chavePix}`;
};

export const PassengerTemplates = {

    contractAvailable: (ctx: PassengerContext): CompositeMessagePart[] => {
        const linkStr = ctx.linkAssinatura ? `\n\n👉 Assine aqui: ${ctx.linkAssinatura}` : "";
        const text = `📄 *Contrato de transporte disponível*\n\n` +
            `${getFirstName(ctx.nomeResponsavel)}, o contrato de *${getFirstName(ctx.nomePassageiro)}* está pronto para assinatura digital.${linkStr}${getSystemFooter(ctx)}`;
        return textPart(text);
    },

    contractSignedBySelf: (ctx: PassengerContext): CompositeMessagePart[] => {
        const linkStr = ctx.contratoUrl ? `\n\n📄 Documento: ${ctx.contratoUrl}` : "";
        const text = `✅ *Contrato assinado — ${ctx.nomePassageiro}*\n\n` +
            `${getFirstName(ctx.nomeResponsavel)}, o contrato de transporte de *${ctx.nomePassageiro}* foi assinado com sucesso.${linkStr}${getSystemFooter(ctx)}`;
        return textPart(text);
    },

    dueSoon: (ctx: PassengerContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor || 0);
        const data = formatToBrazilianDate(ctx.dataVencimento || "");
        const diasMsg = ctx.diasAntecedencia ? ` (daqui a ${ctx.diasAntecedencia} dias)` : "";

        const text = `🗓️ *Mensalidade — ${ctx.nomePassageiro}*\n\n` +
            `${getFirstName(ctx.nomeResponsavel)}, lembrete da mensalidade do transporte.\n\n` +
            `🔹 Valor: *${valor}*\n` +
            `🔹 Vencimento: *${data}*${diasMsg}${getSystemFooter(ctx)}`;
        return textPart(text);
    },

    dueSoonManual: (ctx: PassengerContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor || 0);
        const data = formatToBrazilianDate(ctx.dataVencimento || "");
        const diasMsg = ctx.diasAntecedencia ? ` (daqui a ${ctx.diasAntecedencia} dias)` : "";

        const text = `🗓️ *Mensalidade — ${ctx.nomePassageiro}*\n\n` +
            `${getFirstName(ctx.nomeResponsavel)}, lembrete da mensalidade do transporte.\n\n` +
            `🔹 Valor: *${valor}*\n` +
            `🔹 Vencimento: *${data}*${diasMsg}${getPixBlock(ctx)}${getSystemFooter(ctx)}`;
        return textPart(text);
    },

    dueToday: (ctx: PassengerContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor || 0);
        const data = formatToBrazilianDate(ctx.dataVencimento || "");

        const text = `⚠️ *Mensalidade vence hoje — ${ctx.nomePassageiro}*\n\n` +
            `${getFirstName(ctx.nomeResponsavel)}, a mensalidade de *${valor}* do transporte vence hoje (*${data}*).${getSystemFooter(ctx)}`;
        return textPart(text);
    },

    dueTodayManual: (ctx: PassengerContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor || 0);
        const data = formatToBrazilianDate(ctx.dataVencimento || "");

        const text = `⚠️ *Mensalidade vence hoje — ${ctx.nomePassageiro}*\n\n` +
            `${getFirstName(ctx.nomeResponsavel)}, a mensalidade de *${valor}* do transporte vence hoje (*${data}*).${getPixBlock(ctx)}${getSystemFooter(ctx)}`;
        return textPart(text);
    },

    overdue: (ctx: PassengerContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor || 0);
        const data = formatToBrazilianDate(ctx.dataVencimento || "");

        const text = `🚨 *Mensalidade em atraso — ${ctx.nomePassageiro}*\n\n` +
            `${getFirstName(ctx.nomeResponsavel)}, a mensalidade de *${valor}* (vencida em *${data}*) ainda não foi paga.\n\n` +
            `Entre em contato com o motorista para regularizar.${getSystemFooter(ctx)}`;
        return textPart(text);
    },

    overdueManual: (ctx: PassengerContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor || 0);
        const data = formatToBrazilianDate(ctx.dataVencimento || "");

        const text = `🚨 *Mensalidade em atraso — ${ctx.nomePassageiro}*\n\n` +
            `${getFirstName(ctx.nomeResponsavel)}, a mensalidade de *${valor}* (vencida em *${data}*) ainda não foi paga.${getPixBlock(ctx)}${getSystemFooter(ctx)}`;
        return textPart(text);
    }
};
