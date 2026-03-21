import { formatToBrazilianDate, getMonthNameBR } from "../../../utils/date.utils.js";
import { formatCurrency, getFirstName } from "../../../utils/format.js";

export interface PassengerContext {
    nomeResponsavel: string;
    nomePassageiro: string;
    nomeMotorista: string;
    valor: number;
    dataVencimento: string; // YYYY-MM-DD
    diasAntecedencia?: number;
    diasAtraso?: number;
    linkPagamento?: string; // Futuro
    mes?: number;
    ano?: number;
    usuarioId: string; // ID do Motorista (para roteamento WhatsApp)
    apelidoMotorista?: string; // Preferência de nome de exibição
    // New fields for flexible Lego composition
    reciboUrl?: string;
    telefoneMotorista?: string; // Para contato direto
}

import { CompositeMessagePart } from "../../../types/dtos/whatsapp.dto.js";

// Removidos métodos locais pois agora usamos os utilitários centralizados

// Helper to construct standard PIX message parts for Passengers
const textPart = (text: string): CompositeMessagePart[] => {
    return [{ type: "text", content: text }];
};


// Helper for System Footer
const getSystemFooter = (ctx: PassengerContext) => {
    const phoneLink = ctx.telefoneMotorista 
        ? `\n📞 Dúvidas? Fale com o motorista: https://wa.me/55${ctx.telefoneMotorista.replace(/\D/g, "")}` 
        : "";

    const nomeExibicao = ctx.apelidoMotorista || getFirstName(ctx.nomeMotorista);

    return `\n\n_________________\n🤖 *Sistema Van360*\nEnviada em nome de: *${nomeExibicao}*${phoneLink}`;
};

export const PassengerTemplates = {
    
    /**
     * Cobrança Disponível / Vencimento Próximo
     */
    dueSoon: (ctx: PassengerContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const data = formatToBrazilianDate(ctx.dataVencimento);
        const diasMsg = ctx.diasAntecedencia ? ` (daqui a ${ctx.diasAntecedencia} dias)` : "";
        const nomeResp = getFirstName(ctx.nomeResponsavel);

        const text = `🗓️ *Aviso de Mensalidade*\n\n` +
            `Responsável: *${nomeResp}*\n` +
            `Passageiro(a): *${ctx.nomePassageiro}*\n\n` +
            `🔹 Valor: *${valor}*\n` +
            `🔹 Vencimento: *${data}*${diasMsg}${getSystemFooter(ctx)}`;

        return textPart(text);
    },

    /**
     * Cobrança Vence Hoje
     */
    dueToday: (ctx: PassengerContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const data = formatToBrazilianDate(ctx.dataVencimento);
        const nomeResp = getFirstName(ctx.nomeResponsavel);
        
        const text = `⚠️ *Mensalidade Vence Hoje*\n\n` +
            `Responsável: *${nomeResp}*\n` +
            `Passageiro(a): *${ctx.nomePassageiro}*\n\n` +
            `Informamos que a mensalidade no valor de *${valor}* vence hoje (*${data}*).${getSystemFooter(ctx)}`;

        return textPart(text);
    },

    /**
     * Cobrança em Atraso
     */
    overdue: (ctx: PassengerContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const data = formatToBrazilianDate(ctx.dataVencimento);
        const diasAtraso = ctx.diasAtraso || 1;
        const nomeResp = getFirstName(ctx.nomeResponsavel);
        
        const text = `⚠️ *Aviso de Atraso*\n\n` +
            `Responsável: *${nomeResp}*\n` +
            `Passageiro(a): *${ctx.nomePassageiro}*\n\n` +
            `Identificamos que a mensalidade de *${valor}* (vencida em *${data}*) ainda não foi regularizada.${getSystemFooter(ctx)}`;

        return textPart(text);
    },

    /**
     * Confirmação de Pagamento (Recibo)
     */
    paymentReceived: (ctx: PassengerContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const ref = ctx.mes ? `\nReferência: *${getMonthNameBR(ctx.mes)}/${ctx.ano}*` : "";
        const nomeResp = getFirstName(ctx.nomeResponsavel);
        
        const text = `✅ *Pagamento Confirmado*\n\n` +
            `Responsável: *${nomeResp}*\n` +
            `Passageiro(a): *${ctx.nomePassageiro}*\n\n` +
            `O recebimento da mensalidade de *${valor}* foi confirmado com sucesso.${ref}${getSystemFooter(ctx)}`;

        // Se tiver recibo, envia a imagem com o texto na legenda (Bundle)
        if (ctx.reciboUrl) {
            return [{
                type: "image",
                mediaBase64: ctx.reciboUrl,
                content: text // Caption
            }];
        }

        return textPart(text);
    },

    /**
     * Envio Manual de Cobrança (Lembrete Genérico)
     */
    manualCharge: (ctx: PassengerContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const data = formatToBrazilianDate(ctx.dataVencimento);
        const nomeResp = getFirstName(ctx.nomeResponsavel);

        const text = `🗓️ *Aviso de Mensalidade*\n\n` +
            `Responsável: *${nomeResp}*\n` +
            `Passageiro(a): *${ctx.nomePassageiro}*\n\n` +
            `🔹 Valor: *${valor}*\n` +
            `🔹 Vencimento: *${data}*${getSystemFooter(ctx)}`;

        return textPart(text);
    }
};
