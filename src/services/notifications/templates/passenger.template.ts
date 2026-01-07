/**
 * Templates de Mensagem para Passageiros/Responsáveis
 */

export interface PassengerContext {
    nomeResponsavel: string;
    nomePassageiro: string;
    nomeMotorista: string;
    valor: number;
    dataVencimento: string; // YYYY-MM-DD
    diasAntecedencia?: number;
    diasAtraso?: number;
    linkPagamento?: string; // Futuro
}

const formatCurrency = (val: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
};

export const PassengerTemplates = {
    
    /**
     * Cobrança Disponível / Vencimento Próximo
     */
    dueSoon: (ctx: PassengerContext) => {
        const valor = formatCurrency(ctx.valor);
        const data = formatDate(ctx.dataVencimento);
        const diasMsg = ctx.diasAntecedencia ? `(Daqui a ${ctx.diasAntecedencia} dia(s))` : "";

        return `Olá *${ctx.nomeResponsavel}*, lembrete da Van 360 do Tio(a) *${ctx.nomeMotorista}*: 🚌

A mensalidade de *${ctx.nomePassageiro}* no valor de *${valor}* vence em *${data}* ${diasMsg}.

Segue abaixo o código Pix Copia e Cola. 👇`;
    },

    /**
     * Cobrança Vence Hoje
     */
    dueToday: (ctx: PassengerContext) => {
        const valor = formatCurrency(ctx.valor);
        
        return `Olá *${ctx.nomeResponsavel}*, passando apenas para lembrar que a mensalidade de *${ctx.nomePassageiro}* (${valor}) vence *HOJE*! 🗓️

Caso precise, o código Pix está logo abaixo. 👇`;
    },

    /**
     * Cobrança em Atraso
     */
    overdue: (ctx: PassengerContext) => {
        const valor = formatCurrency(ctx.valor);
        const data = formatDate(ctx.dataVencimento);
        const diasAtraso = ctx.diasAtraso || 1;
        
        return `Olá *${ctx.nomeResponsavel}*, notamos que a mensalidade de *${ctx.nomePassageiro}* (${valor}) venceu dia *${data}* (Há ${diasAtraso} dias de atraso). ⚠️

Para regularizar e evitar bloqueios, estamos reenviando o código Pix abaixo. 👇`;
    },

    /**
     * Confirmação de Pagamento (Recibo)
     */
    paymentReceived: (ctx: PassengerContext) => {
        const valor = formatCurrency(ctx.valor);
        return `Olá *${ctx.nomeResponsavel}*, confirmamos o recebimento da mensalidade de *${ctx.nomePassageiro}* valor de *${valor}*. ✅

Muito obrigado! 🚐💨`;
    }
};
