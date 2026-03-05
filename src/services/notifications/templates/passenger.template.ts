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
    pixPayload?: string;
    reciboUrl?: string;
    telefoneMotorista?: string; // Para contato direto
}

import { CompositeMessagePart } from "../../../types/dtos/whatsapp.dto.js";

const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
};

const getMeshName = (mes?: number) => {
    if (!mes) return "";
    const names = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    return names[mes - 1] || "";
};

// Helper to construct standard PIX message parts for Passengers
const buildPixMessageParts = (text: string, pixPayload?: string): CompositeMessagePart[] => {
    // Se não tiver PIX Payload, retorna apenas o texto
    if (!pixPayload) {
        return [{ type: "text", content: text }];
    }

    const parts: CompositeMessagePart[] = [];

    // Adiciona dica de pagamento automático
    const caption = `${text}\n\n💡 Pague pelo app do seu banco. Não precisa enviar comprovante, o sistema identifica automaticamente.`;

    // 1. Bundle: Image Placeholder (QR Code) with Caption (Instructions)
    // Service recognizes 'qrcode' meta and generate the image
    parts.push({ 
        type: "image", 
        content: caption, // Caption vai aqui
        meta: "qrcode" 
    }); 
    
    // 2. Text Payload (Copy-Paste) - SEPARADO para facilitar copiar
    parts.push({ 
        type: "text", 
        content: pixPayload,
        delayMs: 800 
    });

    return parts;
};

// Helper for simple text messages
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
        const data = formatDate(ctx.dataVencimento);
        const diasMsg = ctx.diasAntecedencia ? ` (daqui a ${ctx.diasAntecedencia} dias)` : "";
        const nomeResp = getFirstName(ctx.nomeResponsavel);

        const text = `🗓️ *Mensalidade Disponível para Pagamento*\n\n` +
            `Responsável: *${nomeResp}*\n` +
            `Passageiro(a): *${ctx.nomePassageiro}*\n\n` +
            `🔹 Valor: *${valor}*\n` +
            `🔹 Vencimento: *${data}*${diasMsg}\n\n` +
            `Copie o código PIX abaixo para realizar o pagamento.${getSystemFooter(ctx)}`;

        return buildPixMessageParts(text, ctx.pixPayload);
    },

    /**
     * Cobrança Vence Hoje
     */
    dueToday: (ctx: PassengerContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const data = formatDate(ctx.dataVencimento);
        const nomeResp = getFirstName(ctx.nomeResponsavel);
        
        const text = `⚠️ *Vencimento Hoje*\n\n` +
            `Responsável: *${nomeResp}*\n` +
            `Passageiro(a): *${ctx.nomePassageiro}*\n\n` +
            `A mensalidade no valor de *${valor}* vence hoje (*${data}*).\n` +
            `Copie o código PIX abaixo para realizar o pagamento.${getSystemFooter(ctx)}`;

        return buildPixMessageParts(text, ctx.pixPayload);
    },

    /**
     * Cobrança em Atraso
     */
    overdue: (ctx: PassengerContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const data = formatDate(ctx.dataVencimento);
        const diasAtraso = ctx.diasAtraso || 1;
        const nomeResp = getFirstName(ctx.nomeResponsavel);
        
        const text = `⚠️ *Mensalidade Pendente*\n\n` +
            `Responsável: *${nomeResp}*\n` +
            `Passageiro(a): *${ctx.nomePassageiro}*\n\n` +
            `A mensalidade no valor de *${valor}* encontra-se em aberto desde *${data}* (${diasAtraso} dias de atraso).\n` +
            `Copie o código PIX abaixo para regularizar e evitar suspensão do serviço.${getSystemFooter(ctx)}`;

        return buildPixMessageParts(text, ctx.pixPayload);
    },

    /**
     * Confirmação de Pagamento (Recibo)
     */
    paymentReceived: (ctx: PassengerContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const ref = ctx.mes ? `\nReferência: *${getMeshName(ctx.mes)}/${ctx.ano}*` : "";
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
        const data = formatDate(ctx.dataVencimento);
        const nomeResp = getFirstName(ctx.nomeResponsavel);

        const text = `🗓️ *Mensalidade para Pagamento*\n\n` +
            `Responsável: *${nomeResp}*\n` +
            `Passageiro(a): *${ctx.nomePassageiro}*\n\n` +
            `🔹 Valor: *${valor}*\n` +
            `🔹 Vencimento: *${data}*\n\n` +
            `Copie o código PIX abaixo para realizar o pagamento.${getSystemFooter(ctx)}`;

        return buildPixMessageParts(text, ctx.pixPayload);
    }
};
