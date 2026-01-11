import { formatCurrency, getFirstName } from "../../../utils/format.js";

/**
 * Templates de Mensagem para Motoristas / Assinantes do Sistema
 */

export interface DriverContext {
    nomeMotorista: string;
    nomePlano: string;
    valor: number;
    dataVencimento: string;
    mes?: number;
    ano?: number;
    reciboUrl?: string; // URL da imagem do comprovante
    trialDays?: number;
    nomePassageiro?: string;
    nomeResponsavel?: string;
}

const formatDate = (dateStr: string) => {
    // Tratamento para data ISO ou YYYY-MM-DD
    const isoDate = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
    const [y, m, d] = isoDate.split("-");
    return `${d}/${m}/${y}`;
};

const getMeshName = (mes?: number) => {
    if (!mes) return "";
    const names = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    return names[mes - 1] || "";
};

export const DriverTemplates = {

    /**
     * Boas-vindas: Plano Gratuito
     */
    welcomeFree: (ctx: DriverContext) => {
        return `Olá *${getFirstName(ctx.nomeMotorista)}*, seja muito bem-vindo à Van360! 🚀

É um prazer ter você conosco no plano *${ctx.nomePlano}*.
Nossa equipe está à disposição para ajudar você a organizar seu transporte escolar.

Aproveite o sistema! 🚐💨`;
    },

    /**
     * Boas-vindas: Plano com Trial (Essencial)
     */
    welcomeTrial: (ctx: DriverContext) => {
        const dias = ctx.trialDays || 7;
        return `Olá *${getFirstName(ctx.nomeMotorista)}*, seja muito bem-vindo à Van360! 🚀

Você começou com o plano *${ctx.nomePlano}*.
Aproveite seu acesso completo por *${dias} dias* de teste grátis!

Após esse período, enviaremos os dados para oficializar sua assinatura.
Qualquer dúvida, estamos à disposição! 🚐💨`;
    },

    /**
     * Ativação: Faça o pagamento para começar
     */
    activation: (ctx: DriverContext) => {
        const valor = formatCurrency(ctx.valor);
        return `Olá *${getFirstName(ctx.nomeMotorista)}*, bem-vindo à Van360! 🚀

Seu plano *${ctx.nomePlano}* no valor de *${valor}* está aguardando ativação.
Realize o pagamento pelo PIX abaixo para liberar seu acesso imediatamente! 👇`;
    },

    /**
     * Renovação: Genérica (Uso manual ou info)
     */
    renewal: (ctx: DriverContext) => {
        const valor = formatCurrency(ctx.valor);
        const data = formatDate(ctx.dataVencimento);
        return `Olá *${getFirstName(ctx.nomeMotorista)}*, sua assinatura do plano *${ctx.nomePlano}* vence em *${data}*. 🗓️
Valor: *${valor}*
Garanta a continuidade do seu acesso pagando o PIX abaixo. 👇`;
    },

    /**
     * Renovação: Aviso Prévio (X dias antes)
     */
    renewalDueSoon: (ctx: DriverContext) => {
        const valor = formatCurrency(ctx.valor);
        const data = formatDate(ctx.dataVencimento);
        return `Olá *${getFirstName(ctx.nomeMotorista)}*, sua assinatura do plano *${ctx.nomePlano}* vence em *${data}*. 🗓️
Valor: *${valor}*
Evite bloqueios pagando antecipadamente pelo PIX abaixo. 👇`;
    },

    /**
     * Renovação: Vence Hoje
     */
    renewalDueToday: (ctx: DriverContext) => {
        const valor = formatCurrency(ctx.valor);
        return `⚠️ *Atenção, ${getFirstName(ctx.nomeMotorista)}!*
Sua assinatura vence *HOJE*!
Para continuar acessando o sistema sem interrupções, realize o pagamento agora:
Valor: *${valor}*
PIX copia e cola 👇`;
    },

    /**
     * Renovação: Atrasado (Ainda não suspenso)
     */
    renewalOverdue: (ctx: DriverContext & { diasAtraso?: number }) => {
        const dias = ctx.diasAtraso ? `há ${ctx.diasAtraso} dias` : "";
        return `❌ *Constamos um atraso!*
Sua mensalidade venceu ${dias} e ainda não identificamos o pagamento.
Regularize agora para evitar o bloqueio do seu acesso.
PIX 👇`;
    },

    /**
     * Acesso Suspenso (Bloqueado)
     */
    accessSuspended: (ctx: DriverContext) => {
        return `🚫 *Acesso Suspenso*
Olá *${getFirstName(ctx.nomeMotorista)}*, como não identificamos o pagamento da sua assinatura, seu acesso ao sistema foi temporariamente *bloqueado*.
Para desbloquear instantaneamente, pague o PIX abaixo. 👇`;
    },

    /**
     * Solicitação de Upgrade / Adicional
     */
    upgradeRequest: (ctx: DriverContext) => {
         return `Olá *${getFirstName(ctx.nomeMotorista)}*, recebemos sua solicitação de alteração de plano para *${ctx.nomePlano}*. 📈

Para efetivar a mudança, realize o pagamento da diferença abaixo. 👇`;
    },
    
    /**
     * Aviso de Recebimento (Pai pagou)
     * Futuro: Webhook do Inter
     */
    paymentReceivedBySystem: (ctx: DriverContext & { nomePagador: string, nomeAluno: string }) => {
        const valor = formatCurrency(ctx.valor);
        const ref = ctx.mes ? ` referente a *${getMeshName(ctx.mes)}/${ctx.ano}*` : "";
        const nomeAlun = getFirstName(ctx.nomeAluno);
        const nomePag = getFirstName(ctx.nomePagador);

        return `✅ *Pagamento Recebido!*
        
A mensalidade do *${nomeAlun}* (*${nomePag}*) no valor de *${valor}*${ref} foi paga.

O pagamento está sendo processado e o valor logo estará em sua conta. ⏳`;
    },

    /**
     * Confirmação de Pagamento de Assinatura (Recibo do Motorista)
     */
    paymentConfirmed: (ctx: DriverContext) => {
        const valor = formatCurrency(ctx.valor);
        const ref = ctx.mes ? ` referente a *${getMeshName(ctx.mes)}/${ctx.ano}*` : "";
        const nomeMot = getFirstName(ctx.nomeMotorista);

        return `✅ *Pagamento Confirmado!*

Olá *${nomeMot}*, confirmamos o recebimento do seu pagamento de *${valor}*${ref} referente ao plano *${ctx.nomePlano}*.

Seu acesso está garantido! 🚐💨

${ctx.reciboUrl ? `📎 *Comprovante:* ${ctx.reciboUrl}` : ''}`;
    },

    /**
     * Aviso de Fim de Trial
     */
    trialEnding: (ctx: DriverContext) => {
        const valor = formatCurrency(ctx.valor);
        const data = formatDate(ctx.dataVencimento);
        
        return `⏳ *Seu Teste Grátis está acabando!*

Olá *${getFirstName(ctx.nomeMotorista)}*, esperamos que esteja gostando da Van360! 🚌

Seu período de testes do plano *${ctx.nomePlano}* termina em *${data}*.
Para continuar usando todos os recursos sem interrupção, confirme sua assinatura realizando o pagamento abaixo.

Valor: *${valor}*
PIX Copia e Cola 👇`;
    },

    /**
     * Falha no Repasse (Invalidar Chave)
     */
    repasseFailed: (ctx: DriverContext) => {
        const valor = formatCurrency(ctx.valor);
        return `⚠️ *Atenção: Falha no Repasse de Pagamento*

Olá *${getFirstName(ctx.nomeMotorista)}*, tentamos realizar o repasse de *${valor}* referente a uma mensalidade, mas o banco retornou erro na sua chave PIX.

Por segurança, **sua chave PIX foi invalidada**.
Por favor, acesse o App e cadastre sua chave novamente para receber este valor.`;
    },
    /**
     * Reativação de Assinatura com Embargo de 24h
     */
    reactivationWithEmbargo: (ctx: DriverContext) => {
        const nomeMot = getFirstName(ctx.nomeMotorista);
        const mes = getMeshName(ctx.mes);
        const ref = mes ? ` de *${mes}/${ctx.ano}*` : "";

        return `✅ *Conta Reativada!*

Olá *${nomeMot}*, sua assinatura foi reativada e o acesso ao sistema liberado. 🚐💨

Como você esteve suspenso, geramos agora suas cobranças${ref} que estavam pendentes.

⚠️ *IMPORTANTE:*
A automação está **PAUSADA por 24 horas** para você. Esse é o tempo para você conferir seu painel e dar baixa em quem já te pagou "por fora" (dinheiro/pix direto) durante a suspensão.

Se não houver baixas, o sistema começará a enviar as notificações para seus passageiros automaticamente em 24h.`;
    },
    /**
     * Aviso de Desconexão do WhatsApp
     */
    whatsappDisconnected: (ctx: DriverContext) => {
        return `⚠️ *Atenção: Seu WhatsApp Desconectou!*

Olá *${getFirstName(ctx.nomeMotorista)}*, notamos que sua conexão com o WhatsApp foi perdida. 📵

Isso impede que o sistema envie as cobranças automáticas para seus passageiros.
Por favor, acesse o painel e reconecte seu WhatsApp (escaneie o QR Code novamente) o mais rápido possível para evitar falhas no envio.`;
    },

    /**
     * Notificação de Novo Pré-Cadastro
     */
    prePassengerCreated: (ctx: DriverContext) => {
        const nomeMot = getFirstName(ctx.nomeMotorista);
        const nomePas = getFirstName(ctx.nomePassageiro) || "um novo passageiro";
        const nomeResp = ctx.nomeResponsavel ? ` (${getFirstName(ctx.nomeResponsavel)})` : "";

        return `🔔 *Novo Pré-Cadastro Realizado!*

Olá *${nomeMot}*, o pré-cadastro de *${nomePas}*${nomeResp} foi realizado com sucesso através do seu link! 🚀

Acesse o sistema agora para revisar os dados, definir o valor da mensalidade e aprovar o cadastro. 🚐💨`;
    }
};
