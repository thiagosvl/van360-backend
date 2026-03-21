import { formatToBrazilianDate, getMonthNameBR } from "../../../utils/date.utils.js";
import { formatCurrency, getFirstName } from "../../../utils/format.js";
import { CompositeMessagePart } from "../../../types/dtos/whatsapp.dto.js";

export interface PassengerContext {
    nomeResponsavel: string;
    nomePassageiro: string;
    nomeMotorista: string;
    valor?: number;
    dataVencimento?: string; // YYYY-MM-DD
    diasAntecedencia?: number;
    diasAtraso?: number;
    linkPagamento?: string; // Futuro
    mes?: number;
    ano?: number;
    usuarioId: string; // ID do Motorista (para roteamento WhatsApp)
    apelidoMotorista?: string; // Preferência de nome de exibição
    reciboUrl?: string;
    telefoneMotorista?: string; // Para contato direto
    linkAssinatura?: string;
    contratoUrl?: string; // URL do PDF final
}

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
     * Contrato Disponível
     */
    contractAvailable: (ctx: PassengerContext): CompositeMessagePart[] => {
        const nomeResp = getFirstName(ctx.nomeResponsavel);
        const linkStr = ctx.linkAssinatura ? `\n\n👉 Acesse o link abaixo para visualizar e assinar:\n\n${ctx.linkAssinatura}` : "";
        const text = `🔔 *Contrato Disponível*\n\n` +
            `Olá *${nomeResp}*,\n` +
            `O contrato de transporte de *${ctx.nomePassageiro}* foi gerado e já está pronto para assinatura digital.${linkStr}\n\n` +
            `Acesse o sistema e finalize o processo online e simplificado.${getSystemFooter(ctx)}`;

        return textPart(text);
    },

    /**
     * Contrato Assinado (Pelo Passageiro)
     */
    contractSignedBySelf: (ctx: PassengerContext): CompositeMessagePart[] => {
        const nomeResp = getFirstName(ctx.nomeResponsavel);
        const linkStr = ctx.contratoUrl ? `\n\n📄 Você pode visualizar o documento final no link abaixo:\n\n${ctx.contratoUrl}` : "";
        const text = `✅ *Contrato Assinado*\n\n` +
            `Olá *${nomeResp}*,\n` +
            `Confirmamos que seu contrato de transporte para *${ctx.nomePassageiro}* foi assinado com sucesso!${linkStr}\n\n` +
            `Desejamos uma ótima parceria! 🚀${getSystemFooter(ctx)}`;

        return textPart(text);
    },

    /**
     * Lembrete de Mensalidade Próxima
     */
    dueSoon: (ctx: PassengerContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor || 0);
        const data = formatToBrazilianDate(ctx.dataVencimento || "");
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
     * Mensalidade Vence Hoje (Venceu)
     */
    dueToday: (ctx: PassengerContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor || 0);
        const data = formatToBrazilianDate(ctx.dataVencimento || "");
        const nomeResp = getFirstName(ctx.nomeResponsavel);
        
        const text = `⚠️ *Mensalidade Vence Hoje*\n\n` +
            `Responsável: *${nomeResp}*\n` +
            `Passageiro(a): *${ctx.nomePassageiro}*\n\n` +
            `Informamos que a mensalidade no valor de *${valor}* vence hoje (*${data}*).${getSystemFooter(ctx)}`;

        return textPart(text);
    },

    /**
     * Mensalidade Atrasada
     */
    overdue: (ctx: PassengerContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor || 0);
        const data = formatToBrazilianDate(ctx.dataVencimento || "");
        const nomeResp = getFirstName(ctx.nomeResponsavel);
        
        const text = `⚠️ *Aviso de Atraso*\n\n` +
            `Responsável: *${nomeResp}*\n` +
            `Passageiro(a): *${ctx.nomePassageiro}*\n\n` +
            `Identificamos que a mensalidade de *${valor}* (vencida em *${data}*) ainda não foi regularizada.${getSystemFooter(ctx)}`;

        return textPart(text);
    }
};
