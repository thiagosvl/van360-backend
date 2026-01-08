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
     * Renovação: Genérica (Uso manual ou info)
     */
    renewal: (ctx: DriverContext) => {
        const valor = formatCurrency(ctx.valor);
        const data = formatDate(ctx.dataVencimento);
        return `Olá *${ctx.nomeMotorista}*, sua assinatura do plano *${ctx.nomePlano}* vence em *${data}*. 🗓️
Valor: *${valor}*
Garanta a continuidade do seu acesso pagando o Pix abaixo. 👇`;
    },

    /**
     * Renovação: Aviso Prévio (X dias antes)
     */
    renewalDueSoon: (ctx: DriverContext) => {
        const valor = formatCurrency(ctx.valor);
        const data = formatDate(ctx.dataVencimento);
        return `Olá *${ctx.nomeMotorista}*, sua assinatura do plano *${ctx.nomePlano}* vence em *${data}*. 🗓️
Valor: *${valor}*
Evite bloqueios pagando antecipadamente pelo Pix abaixo. 👇`;
    },

    /**
     * Renovação: Vence Hoje
     */
    renewalDueToday: (ctx: DriverContext) => {
        const valor = formatCurrency(ctx.valor);
        return `⚠️ *Atenção, ${ctx.nomeMotorista}!*
Sua assinatura vence *HOJE*!
Para continuar acessando o sistema sem interrupções, realize o pagamento agora:
Valor: *${valor}*
Pix copia e cola 👇`;
    },

    /**
     * Renovação: Atrasado (Ainda não suspenso)
     */
    renewalOverdue: (ctx: DriverContext & { diasAtraso?: number }) => {
        const dias = ctx.diasAtraso ? `há ${ctx.diasAtraso} dias` : "";
        return `❌ *Constamos um atraso!*
Sua mensalidade venceu ${dias} e ainda não identificamos o pagamento.
Regularize agora para evitar o bloqueio do seu acesso.
Pix 👇`;
    },

    /**
     * Acesso Suspenso (Bloqueado)
     */
    accessSuspended: (ctx: DriverContext) => {
        return `🚫 *Acesso Suspenso*
Olá ${ctx.nomeMotorista}, como não identificamos o pagamento da sua assinatura, seu acesso ao sistema foi temporariamente *bloqueado*.
Para desbloquear instantaneamente, pague o Pix abaixo. 👇`;
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
        return `💰 *Venda Realizada!*
        
O responsável *${ctx.nomePagador}* pagou a mensalidade de *${ctx.nomeAluno}* (${valor}).

O valor já está sendo processado para transferência. ⏳`;
    },

    /**
     * Confirmação de Pagamento de Assinatura (Recibo do Motorista)
     */
    paymentConfirmed: (ctx: DriverContext) => {
        const valor = formatCurrency(ctx.valor);
        return `✅ *Pagamento Confirmado!*

Olá *${ctx.nomeMotorista}*, confirmamos o recebimento do seu pagamento de *${valor}* referente ao plano *${ctx.nomePlano}*.

Seu acesso está garantido! 🚐💨`;
    },

    /**
     * Aviso de Fim de Trial
     */
    trialEnding: (ctx: DriverContext) => {
        const valor = formatCurrency(ctx.valor);
        const data = formatDate(ctx.dataVencimento);
        
        return `⏳ *Seu Teste Grátis está acabando!*

Olá *${ctx.nomeMotorista}*, esperamos que esteja gostando da Van 360! 🚌

Seu período de testes do plano *${ctx.nomePlano}* termina em *${data}*.
Para continuar usando todos os recursos sem interrupção, confirme sua assinatura realizando o pagamento abaixo.

Valor: *${valor}*
Pix Copia e Cola 👇`;
    },

    /**
     * Falha no Repasse (Invalidar Chave)
     */
    repasseFailed: (ctx: DriverContext) => {
        const valor = formatCurrency(ctx.valor);
        return `⚠️ *Atenção: Falha no Repasse de Pagamento*

Olá *${ctx.nomeMotorista}*, tentamos realizar o repasse de *${valor}* referente a uma mensalidade, mas o banco retornou erro na sua chave PIX.

Por segurança, **sua chave PIX foi invalidada**.
Por favor, acesse o App e cadastre sua chave novamente para receber este valor.`;
    }
};
