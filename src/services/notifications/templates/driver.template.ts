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
    // New fields for flexible Lego composition
    pixPayload?: string; 
    isActivation?: boolean; // Se é o primeiro pagamento (Onboarding)
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

import { CompositeMessagePart } from "../../../types/dtos/whatsapp.dto.js";

// Helper to construct standard PIX message parts
// Helper to construct standard PIX message parts
const buildPixMessageParts = (text: string, pixPayload?: string): CompositeMessagePart[] => {
    // Se não tiver PIX Payload, retorna apenas o texto
    if (!pixPayload) {
        return [{ type: "text", content: text }];
    }

    const parts: CompositeMessagePart[] = [];

    // Adiciona dica de pagamento automático
    const caption = `${text}\n\n💡 Pague pelo app do seu banco. Não precisa enviar comprovante, o sistema identifica automaticamente! ✨`;

    // 1. Bundle: Image Placeholder (QR Code) with Caption (Instructions)
    // Service recognize 'qrcode' meta and generate the image
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

export const DriverTemplates = {



    /**
     * Boas-vindas: Plano com Trial (Essencial)
     */
    welcomeTrial: (ctx: DriverContext): CompositeMessagePart[] => {
        const dias = ctx.trialDays || 7;
        const validade = ctx.dataVencimento ? formatDate(ctx.dataVencimento) : "";
        
        // Se temos a data exata, mostramos "Válido até DD/MM/AAAA", senão genérico
        const validadeMsg = validade ? `\nVálido até: *${validade}*` : "";

        return textPart(`Olá *${getFirstName(ctx.nomeMotorista)}*, seja muito bem-vindo à Van360! 🚀

Você começou com o plano *${ctx.nomePlano}*.
Aproveite seu acesso completo por *${dias} dias* de teste grátis!${validadeMsg}

Após esse período, enviaremos os dados para oficializar sua assinatura.
Qualquer dúvida, estamos à disposição! 🚐💨`);
    },

    /**
     * Ativação: Faça o pagamento para começar
     */
    activation: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const text = `Olá *${getFirstName(ctx.nomeMotorista)}*, bem-vindo à Van360! 🚀

Seu plano *${ctx.nomePlano}* no valor de *${valor}* está aguardando ativação.
Realize o pagamento pelo PIX abaixo para liberar seu acesso imediatamente! 👇`;

        return buildPixMessageParts(text, ctx.pixPayload);
    },

    /**
     * Renovação: Genérica (Uso manual ou info)
     */
    renewal: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const data = formatDate(ctx.dataVencimento);
        const text = `Olá *${getFirstName(ctx.nomeMotorista)}*, sua assinatura do plano *${ctx.nomePlano}* vence em *${data}*. 🗓️
Valor: *${valor}*
Garanta a continuidade do seu acesso pagando o PIX abaixo. 👇`;

        return buildPixMessageParts(text, ctx.pixPayload);
    },

    /**
     * Renovação: Aviso Prévio (X dias antes)
     */
    renewalDueSoon: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const data = formatDate(ctx.dataVencimento);
        const text = `Olá *${getFirstName(ctx.nomeMotorista)}*, sua assinatura do plano *${ctx.nomePlano}* vence em *${data}*. 🗓️
Valor: *${valor}*
Evite bloqueios pagando antecipadamente pelo PIX abaixo. 👇`;
        
        return buildPixMessageParts(text, ctx.pixPayload);
    },

    /**
     * Renovação: Vence Hoje
     */
    renewalDueToday: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const text = `⚠️ *Atenção, ${getFirstName(ctx.nomeMotorista)}!*
Sua assinatura vence *HOJE*!
Para continuar acessando o sistema sem interrupções, realize o pagamento agora:
Valor: *${valor}*
PIX copia e cola 👇`;

        return buildPixMessageParts(text, ctx.pixPayload);
    },

    /**
     * Renovação: Atrasado (Ainda não suspenso)
     */
    renewalOverdue: (ctx: DriverContext & { diasAtraso?: number }): CompositeMessagePart[] => {
        const dias = ctx.diasAtraso ? `há ${ctx.diasAtraso} dias` : "";
        const text = `❌ *Constamos um atraso!*
Sua mensalidade venceu ${dias} e ainda não identificamos o pagamento.
Regularize agora para evitar o bloqueio do seu acesso.
PIX 👇`;
        return buildPixMessageParts(text, ctx.pixPayload);
    },

    /**
     * Acesso Suspenso (Bloqueado)
     */
    accessSuspended: (ctx: DriverContext): CompositeMessagePart[] => {
        const text = `🚫 *Acesso Limitado*
Olá *${getFirstName(ctx.nomeMotorista)}*, como não identificamos o pagamento da sua assinatura, seu acesso foi *temporariamente limitado*.

Você ainda pode visualizar seus dados, mas novas ações e automações estão restritas. 🔒
Para liberar o uso completo instantaneamente, pague o PIX abaixo. 👇`;
        return buildPixMessageParts(text, ctx.pixPayload);
    },

    /**
     * Solicitação de Upgrade / Adicional
     */
    upgradeRequest: (ctx: DriverContext): CompositeMessagePart[] => {
         const text = `Olá *${getFirstName(ctx.nomeMotorista)}*, recebemos sua solicitação de alteração de plano para *${ctx.nomePlano}*. 📈

Para efetivar a mudança, realize o pagamento da diferença abaixo. 👇`;
         return buildPixMessageParts(text, ctx.pixPayload);
    },
    
    /**
     * Aviso de Recebimento (Pai pagou)
     */
    paymentReceivedBySystem: (ctx: DriverContext & { nomePagador: string, nomePassageiro: string }): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const ref = ctx.mes ? ` referente a *${getMeshName(ctx.mes)}/${ctx.ano}*` : "";
        const nomeAlun = getFirstName(ctx.nomePassageiro);
        const nomePag = getFirstName(ctx.nomePagador);

        return textPart(`✅ *Pagamento Recebido!*
        
A mensalidade do *${nomeAlun}* (*${nomePag}*) no valor de *${valor}*${ref} foi paga.

O pagamento está sendo processado e o valor logo estará em sua conta. ⏳`);
    },

    /**
     * Confirmação de Pagamento de Assinatura (Recibo do Motorista)
     */
    paymentConfirmed: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const ref = ctx.mes ? ` referente a *${getMeshName(ctx.mes)}/${ctx.ano}*` : "";
        const nomeMot = getFirstName(ctx.nomeMotorista);
        const validade = ctx.dataVencimento ? `\n🗓️ *Validade do Plano:* ${formatDate(ctx.dataVencimento)}` : "";

        const text = `✅ *Pagamento Confirmado!*

Olá *${nomeMot}*, confirmamos o recebimento do seu pagamento de *${valor}*${ref} referente ao plano *${ctx.nomePlano}*.
${validade}

Seu acesso está garantido! 🚐💨`;

        const parts: CompositeMessagePart[] = [];

        // 1. Recibo / Confirmação
        if (ctx.reciboUrl) {
            parts.push({
                type: "image",
                mediaBase64: ctx.reciboUrl,
                content: text // Caption
            });
        } else {
            parts.push({ type: "text", content: text });
        }

        // 2. Lembretes Importantes (APENAS NA ATIVAÇÃO E PLANO PROFISSIONAL)
        // Lembretes Importantes (APENAS NA ATIVAÇÃO E PLANO PROFISSIONAL)
        const isProfessional = ctx.nomePlano.toLowerCase().includes("profissional");
        
        if (ctx.isActivation && isProfessional) {
            // Header
            parts.push({
                type: "text",
                content: `⚠ *Importante: Próximos Passos*
Para aproveitar ao máximo a automação do Plano Profissional:`,
                delayMs: 1500
            });

            // Passo 1
            parts.push({
                type: "text",
                content: `1️⃣ *Cadastre sua Chave PIX*
Acesse o menu *Minha Conta* e cadastre sua chave para receber os pagamentos dos passageiros direto na sua conta bancária. 💸`,
                delayMs: 1500
            });


        }
        
        return parts;
    },

    /**
     * Aviso de Fim de Trial
     */
    trialEnding: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const data = formatDate(ctx.dataVencimento);
        
        const text = `⏳ *Seu Teste Grátis está acabando!*

Olá *${getFirstName(ctx.nomeMotorista)}*, esperamos que esteja gostando da Van360! 🚌

Seu período de testes do plano *${ctx.nomePlano}* termina em *${data}*.
Para continuar usando todos os recursos sem interrupção, confirme sua assinatura realizando o pagamento abaixo.

Valor: *${valor}*
PIX Copia e Cola 👇`;

        return buildPixMessageParts(text, ctx.pixPayload);
    },

    /**
     * Falha no Repasse (Invalidar Chave)
     */
    repasseFailed: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        return textPart(`⚠️ *Atenção: Falha no Repasse de Pagamento*

Olá *${getFirstName(ctx.nomeMotorista)}*, tentamos realizar o repasse de *${valor}* referente a uma mensalidade, mas o banco retornou erro na sua chave PIX.

Por segurança, **sua chave PIX foi invalidada**.
Por favor, acesse o App e cadastre sua chave novamente para receber este valor.`);
    },
    /**
     * Reativação de Assinatura com Embargo de 24h
     */
    reactivationWithEmbargo: (ctx: DriverContext): CompositeMessagePart[] => {
        const nomeMot = getFirstName(ctx.nomeMotorista);
        const mes = getMeshName(ctx.mes);
        const ref = mes ? ` de *${mes}/${ctx.ano}*` : "";

        return textPart(`✅ *Conta Reativada!*

Olá *${nomeMot}*, sua assinatura foi reativada e o acesso ao sistema liberado. 🚐💨

Como você esteve suspenso, geramos agora suas cobranças${ref} que estavam pendentes.

⚠️ *IMPORTANTE:*
A automação está **PAUSADA por 24 horas** para você. Esse é o tempo para você conferir seu painel e dar baixa em quem já te pagou "por fora" (dinheiro/pix direto) durante a suspensão.

Se não houver baixas, o sistema começará a enviar as notificações para seus passageiros automaticamente em 24h.`);
    },


    /**
     * Notificação de Novo Pré-Cadastro
     */
    prePassengerCreated: (ctx: DriverContext): CompositeMessagePart[] => {
        const nomeMot = getFirstName(ctx.nomeMotorista);
        const nomePas = getFirstName(ctx.nomePassageiro) || "um novo passageiro";
        const nomeResp = ctx.nomeResponsavel ? ` (${getFirstName(ctx.nomeResponsavel)})` : "";

        return textPart(`🔔 *Novo Pré-Cadastro Realizado!*

Olá *${nomeMot}*, o pré-cadastro de *${nomePas}*${nomeResp} foi realizado com sucesso através do seu link! 🚀

Acesse o sistema agora para revisar os dados, definir o valor da mensalidade e aprovar o cadastro. 🚐💨`);
    },

    /**
     * Sucesso na Validação da Chave PIX
     */
    pixKeyValidated: (ctx: DriverContext): CompositeMessagePart[] => {
        const nomeMot = getFirstName(ctx.nomeMotorista);

        return textPart(`✅ *Chave PIX Validada!*

Sua chave PIX foi validada com sucesso pelo banco. 🎉🏢

Agora você receberá os pagamentos diretamente em sua conta.`);
    },

    /**
     * Falha na Validação da Chave PIX
     */
    pixKeyValidationFailed: (ctx: DriverContext): CompositeMessagePart[] => {
        const nomeMot = getFirstName(ctx.nomeMotorista);
        
        return textPart(`❌ *Validação da Chave PIX Falhou*

Olá *${nomeMot}*, o banco rejeitou a chave PIX informada.

Isso geralmente acontece quando o CPF/CNPJ da chave não é o mesmo do titular da conta bancária.

Por favor, acesse o aplicativo e cadastre uma nova chave válida para receber seus pagamentos.`);
    }
};
