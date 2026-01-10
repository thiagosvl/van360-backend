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
}

const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
};

const getMeshName = (mes?: number) => {
    if (!mes) return "";
    const names = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    return names[mes - 1] || "";
};

export const PassengerTemplates = {
    
    /**
     * Cobrança Disponível / Vencimento Próximo
     */
    dueSoon: (ctx: PassengerContext) => {
        const valor = formatCurrency(ctx.valor);
        const data = formatDate(ctx.dataVencimento);
        const diasMsg = ctx.diasAntecedencia ? ` (Daqui a ${ctx.diasAntecedencia} dia(s))` : "";
        const nomeResp = getFirstName(ctx.nomeResponsavel);
        const nomeMotorista = getFirstName(ctx.nomeMotorista);

        return `Olá *${nomeResp}*, lembrete da Van360 do Tio(a) *${nomeMotorista}*: 🚌

A mensalidade de *${getFirstName(ctx.nomePassageiro)}* no valor de *${valor}* vence em *${data}*${diasMsg}.

Segue abaixo o código Pix Copia e Cola. 👇`;
    },

    /**
     * Cobrança Vence Hoje
     */
    dueToday: (ctx: PassengerContext) => {
        const valor = formatCurrency(ctx.valor);
        const nomeResp = getFirstName(ctx.nomeResponsavel);
        
        return `Olá *${nomeResp}*, passando apenas para lembrar que a mensalidade de *${getFirstName(ctx.nomePassageiro)}* (${valor}) vence *HOJE*! 🗓️

Caso precise, o código Pix está logo abaixo. 👇`;
    },

    /**
     * Cobrança em Atraso
     */
    overdue: (ctx: PassengerContext) => {
        const valor = formatCurrency(ctx.valor);
        const data = formatDate(ctx.dataVencimento);
        const diasAtraso = ctx.diasAtraso || 1;
        const nomeResp = getFirstName(ctx.nomeResponsavel);
        
        return `Olá *${nomeResp}*, notamos que a mensalidade de *${getFirstName(ctx.nomePassageiro)}* (${valor}) venceu dia *${data}* (Há ${diasAtraso} dias de atraso). ⚠️

Para regularizar e evitar bloqueios, estamos reenviando o código Pix abaixo. 👇`;
    },

    /**
     * Confirmação de Pagamento (Recibo)
     */
    paymentReceived: (ctx: PassengerContext) => {
        const valor = formatCurrency(ctx.valor);
        const ref = ctx.mes ? ` referente ao mês de *${getMeshName(ctx.mes)}/${ctx.ano}*` : "";
        const nomeResp = getFirstName(ctx.nomeResponsavel);
        
        return `Olá *${nomeResp}*, confirmamos o recebimento da mensalidade de *${getFirstName(ctx.nomePassageiro)}* no valor de *${valor}*${ref}. ✅

Muito obrigado! 🚐💨`;
    },

    /**
     * Envio Manual de Cobrança (Lembrete Genérico)
     */
    manualCharge: (ctx: PassengerContext) => {
        const valor = formatCurrency(ctx.valor);
        const data = formatDate(ctx.dataVencimento);
        const nomeResp = getFirstName(ctx.nomeResponsavel);
        const nomeMotorista = getFirstName(ctx.nomeMotorista);

        return `Olá *${nomeResp}*, segue o lembrete de mensalidade da Van360 do Tio(a) *${nomeMotorista}*:

Mensalidade de *${getFirstName(ctx.nomePassageiro)}* (${valor}) com vencimento em *${data}*. 🚐

Segue abaixo o código Pix Copia e Cola. 👇`;
    }
};
