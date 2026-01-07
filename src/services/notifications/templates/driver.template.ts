/**
 * Templates de Mensagem para Motoristas / Assinantes do Sistema
 */

export interface DriverContext {
    nomeMotorista: string;
    nomePlano: string;
    valor: number;
    dataVencimento: string;
}

const formatCurrency = (val: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
const formatDate = (dateStr: string) => {
    // Tratamento para data ISO ou YYYY-MM-DD
    const isoDate = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
    const [y, m, d] = isoDate.split("-");
    return `${d}/${m}/${y}`;
};

export const DriverTemplates = {

    /**
     * Ativação: Faça o pagamento para começar
     */
    activation: (ctx: DriverContext) => {
        const valor = formatCurrency(ctx.valor);
        return `Olá *${ctx.nomeMotorista}*, bem-vindo à Van 360! 🚀

Seu plano *${ctx.nomePlano}* no valor de *${valor}* está aguardando ativação.
Realize o pagamento pelo Pix abaixo para liberar seu acesso imediatamente! 👇`;
    },

    /**
     * Renovação: Para continuar usando
     */
    renewal: (ctx: DriverContext) => {
        const valor = formatCurrency(ctx.valor);
        const data = formatDate(ctx.dataVencimento);

        return `Olá *${ctx.nomeMotorista}*, sua assinatura do plano *${ctx.nomePlano}* vence em *${data}*. 🗓️

Valor: *${valor}*

Garanta a continuidade do seu acesso pagando o Pix abaixo. 👇`;
    },

    /**
     * Solicitação de Upgrade / Adicional
     */
    upgradeRequest: (ctx: DriverContext) => {
         return `Olá *${ctx.nomeMotorista}*, recebemos sua solicitação de alteração de plano para *${ctx.nomePlano}*. 📈

Para efetivar a mudança, realize o pagamento da diferença abaixo. 👇`;
    },
    
    /**
     * Aviso de Recebimento (Pai pagou)
     * Futuro: Webhook do Inter
     */
    paymentReceivedBySystem: (ctx: DriverContext & { nomePagador: string, nomeAluno: string }) => {
        const valor = formatCurrency(ctx.valor);
        return `💰 *Pagamento Recebido!*
        
O responsável *${ctx.nomePagador}* pagou a mensalidade de *${ctx.nomeAluno}* (${valor}).

O repasse será processado conforme as regras do seu plano.`;
    }
};
