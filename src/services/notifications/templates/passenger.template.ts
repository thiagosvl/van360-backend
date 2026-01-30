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
    const caption = `${text}\n\n💡 Pague pelo app do seu banco. Não precisa enviar comprovante, o sistema identifica automaticamente! ✨`;

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

    return `\n\n_________________\n🤖 *Mensagem Automática Van360*\nEnviada em nome de: *${nomeExibicao}*${phoneLink}`;
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
        const nomeMotorista = ctx.apelidoMotorista || getFirstName(ctx.nomeMotorista);

        const text = `Oi *${nomeResp}*! Tudo bem? 👋\n\n` +
            `Passando para enviar o lembrete da mensalidade do(a) *${ctx.nomePassageiro}* referente ao transporte com o(a) Tio(a) *${nomeMotorista}*.\n\n` +
            `🔹 Valor: *${valor}*\n` +
            `🔹 Vencimento: *${data}*${diasMsg}\n\n` +
            `Segue abaixo o código PIX para sua comodidade. 👇${getSystemFooter(ctx)}`;

        return buildPixMessageParts(text, ctx.pixPayload);
    },

    /**
     * Cobrança Vence Hoje
     */
    dueToday: (ctx: PassengerContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const nomeResp = getFirstName(ctx.nomeResponsavel);
        
        const text = `Oi *${nomeResp}*! Tudo bem? 👋\n\n` +
            `Lembrete rapidinho: a mensalidade do(a) *${ctx.nomePassageiro}* no valor de *${valor}* vence *HOJE*! 🗓️\n\n` +
            `Se precisar, o código PIX está logo abaixo. 👇${getSystemFooter(ctx)}`;

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
        
        const text = `Oi *${nomeResp}*! Tudo bem? 👋\n\n` +
            `Notamos que a mensalidade do(a) *${ctx.nomePassageiro}* (${valor}) ainda não foi identificada e está vencida desde o dia *${data}* (${diasAtraso} dias de atraso). ⚠️\n\n` +
            `Para manter tudo em dia e facilitar para você, estamos reenviando o código PIX abaixo. 👇${getSystemFooter(ctx)}`;

        return buildPixMessageParts(text, ctx.pixPayload);
    },

    /**
     * Confirmação de Pagamento (Recibo)
     */
    paymentReceived: (ctx: PassengerContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const ref = ctx.mes ? ` referente a *${getMeshName(ctx.mes)}/${ctx.ano}*` : "";
        const nomeResp = getFirstName(ctx.nomeResponsavel);
        
        const text = `Oi *${nomeResp}*! Tudo bem? 👋\n\n` +
            `Confirmamos o recebimento da mensalidade do(a) *${ctx.nomePassageiro}* no valor de *${valor}*${ref}. ✅\n\n` +
            `Muito obrigado e uma ótima semana! 🚐💨${getSystemFooter(ctx)}`;

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
        const nomeMotorista = ctx.apelidoMotorista || getFirstName(ctx.nomeMotorista);

        const text = `Oi *${nomeResp}*! Tudo bem? 👋\n\n` +
            `Conforme solicitado, segue o código da mensalidade do(a) *${ctx.nomePassageiro}* com o(a) Tio(a) *${nomeMotorista}*:\n\n` +
            `🔹 Valor: *${valor}*\n` +
            `🔹 Vencimento: *${data}*\n\n` +
            `O código PIX está logo abaixo. 👇${getSystemFooter(ctx)}`;

        return buildPixMessageParts(text, ctx.pixPayload);
    }
};
