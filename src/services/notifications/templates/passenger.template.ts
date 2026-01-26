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

    return `\n\n_________________\n🤖 *Mensagem Automática Van360*\nEnviada em nome de: *${getFirstName(ctx.nomeMotorista)}*${phoneLink}`;
};

export const PassengerTemplates = {
    
    /**
     * Cobrança Disponível / Vencimento Próximo
     */
    dueSoon: (ctx: PassengerContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const data = formatDate(ctx.dataVencimento);
        const diasMsg = ctx.diasAntecedencia ? ` (Daqui a ${ctx.diasAntecedencia} dia(s))` : "";
        const nomeResp = getFirstName(ctx.nomeResponsavel);
        const nomeMotorista = getFirstName(ctx.nomeMotorista);

        const text = `Olá *${nomeResp}*, lembrete da Van360 do Tio(a) *${nomeMotorista}*: 🚌

A mensalidade de *${getFirstName(ctx.nomePassageiro)}* no valor de *${valor}* vence em *${data}*${diasMsg}.

Segue abaixo o código PIX Copia e Cola. 👇${getSystemFooter(ctx)}`;

        return buildPixMessageParts(text, ctx.pixPayload);
    },

    /**
     * Cobrança Vence Hoje
     */
    dueToday: (ctx: PassengerContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const nomeResp = getFirstName(ctx.nomeResponsavel);
        
        const text = `Olá *${nomeResp}*, passando apenas para lembrar que a mensalidade de *${getFirstName(ctx.nomePassageiro)}* (${valor}) vence *HOJE*! 🗓️

Caso precise, o código PIX está logo abaixo. 👇${getSystemFooter(ctx)}`;

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
        
        const text = `Olá *${nomeResp}*, notamos que a mensalidade de *${getFirstName(ctx.nomePassageiro)}* (${valor}) venceu dia *${data}* (Há ${diasAtraso} dias de atraso). ⚠️

Para regularizar e evitar bloqueios, estamos reenviando o código PIX abaixo. 👇${getSystemFooter(ctx)}`;

        return buildPixMessageParts(text, ctx.pixPayload);
    },

    /**
     * Confirmação de Pagamento (Recibo)
     */
    paymentReceived: (ctx: PassengerContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const ref = ctx.mes ? ` referente ao mês de *${getMeshName(ctx.mes)}/${ctx.ano}*` : "";
        const nomeResp = getFirstName(ctx.nomeResponsavel);
        
        const text = `Olá *${nomeResp}*, confirmamos o recebimento da mensalidade de *${getFirstName(ctx.nomePassageiro)}* no valor de *${valor}*${ref}. ✅

Muito obrigado! 🚐💨${getSystemFooter(ctx)}`;

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
        const nomeMotorista = getFirstName(ctx.nomeMotorista);

        const text = `Olá *${nomeResp}*, segue o lembrete de mensalidade da Van360 do Tio(a) *${nomeMotorista}*:

Mensalidade de *${getFirstName(ctx.nomePassageiro)}* (${valor}) com vencimento em *${data}*. 🚐

Segue abaixo o código PIX Copia e Cola. 👇${getSystemFooter(ctx)}`;

        return buildPixMessageParts(text, ctx.pixPayload);
    }
};
