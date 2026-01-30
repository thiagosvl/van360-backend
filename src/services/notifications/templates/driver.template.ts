import { formatCurrency, formatPixKey, getFirstName } from "../../../utils/format.js";

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
    chavePix?: string;
    tipoChavePix?: string;
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
        const validadeMsg = validade ? ` até *${validade}*` : "";

        return textPart(`Oi *${getFirstName(ctx.nomeMotorista)}*! Tudo bem? 👋\n\n` +
            `Seja muito bem-vindo(a) à Van360! 🚀\n\n` +
            `Você acaba de ativar o plano *${ctx.nomePlano}*.\n\n` +
            `Aproveite seu acesso completo por *${dias} dias* de teste grátis${validadeMsg}.\n\n` +
            `Qualquer dúvida, nossa equipe está aqui para ajudar. Bora decolar? 🚐💨`);
    },

    /**
     * Ativação: Faça o pagamento para começar
     */
    activation: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const text = `Oi *${getFirstName(ctx.nomeMotorista)}*! Tudo bem? 👋\n\n` +
            `Estamos quase lá! Seu plano *${ctx.nomePlano}* no valor de *${valor}* está aguardando ativação.\n\n` +
            `Realize o pagamento pelo PIX abaixo para liberar seu acesso imediatamente! 🚀`;

        return buildPixMessageParts(text, ctx.pixPayload);
    },

    /**
     * Renovação: Genérica (Uso manual ou info)
     */
    renewal: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const data = formatDate(ctx.dataVencimento);
        const text = `Oi *${getFirstName(ctx.nomeMotorista)}*! 👋\n\n` +
            `Sua assinatura do plano *${ctx.nomePlano}* vence em *${data}*.\n\n` +
            `🔹 Valor: *${valor}*\n\n` +
            `Garanta a continuidade do seu acesso pagando o PIX abaixo. 👇`;

        return buildPixMessageParts(text, ctx.pixPayload);
    },

    /**
     * Renovação: Aviso Prévio (X dias antes)
     */
    renewalDueSoon: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const data = formatDate(ctx.dataVencimento);
        const text = `Oi *${getFirstName(ctx.nomeMotorista)}*! 👋\n\n` +
            `Lembrete de renovação: sua assinatura do plano *${ctx.nomePlano}* vence em *${data}*.\n\n` +
            `🔹 Valor: *${valor}*\n\n` +
            `Evite bloqueios pagando antecipadamente pelo PIX abaixo. 👇`;
        
        return buildPixMessageParts(text, ctx.pixPayload);
    },

    /**
     * Renovação: Vence Hoje
     */
    renewalDueToday: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const text = `⚠️ *Atenção, ${getFirstName(ctx.nomeMotorista)}!*\n\n` +
            `Sua assinatura da Van360 vence *HOJE*!\n\n` +
            `Para continuar acessando o sistema sem interrupções, realize o pagamento agora:\n\n` +
            `💰 Valor: *${valor}*\n\n` +
            `O código PIX está logo abaixo. 👇`;

        return buildPixMessageParts(text, ctx.pixPayload);
    },

    /**
     * Renovação: Atrasado (Ainda não suspenso)
     */
    renewalOverdue: (ctx: DriverContext & { diasAtraso?: number }): CompositeMessagePart[] => {
        const dias = ctx.diasAtraso ? `há ${ctx.diasAtraso} dias` : "em atraso";
        const text = `❌ *Identificamos um atraso!*\n\n` +
            `Oi *${getFirstName(ctx.nomeMotorista)}*, sua mensalidade está vencida *${dias}* e ainda não recebemos a confirmação do pagamento.\n\n` +
            `Regularize agora para evitar o bloqueio automático de suas funcionalidades. 👇`;
        return buildPixMessageParts(text, ctx.pixPayload);
    },

    /**
     * Acesso Suspenso (Bloqueado)
     */
    accessSuspended: (ctx: DriverContext): CompositeMessagePart[] => {
        const text = `🚫 *Acesso Limitado*\n\n` +
            `Oi *${getFirstName(ctx.nomeMotorista)}*, como não identificamos o pagamento da sua assinatura, seu acesso foi *temporariamente limitado*.\n\n` +
            `Você ainda pode visualizar seus dados, mas novas ações estão restritas. 🔒\n\n` +
            `Para liberar o uso completo instantaneamente, utilize o PIX abaixo. 👇`;
        return buildPixMessageParts(text, ctx.pixPayload);
    },

    /**
     * Solicitação de Upgrade / Adicional
     */
    upgradeRequest: (ctx: DriverContext): CompositeMessagePart[] => {
         const text = `Oi *${getFirstName(ctx.nomeMotorista)}*! 👋\n\n` +
            `Recebemos sua solicitação para mudar para o plano *${ctx.nomePlano}*. 🚀\n\n` +
            `Para efetivar a mudança imediatamente, realize o pagamento da diferença abaixo. 👇`;
         return buildPixMessageParts(text, ctx.pixPayload);
    },
    
    /**
     * Aviso de Recebimento (Pai pagou)
     */
    paymentReceivedBySystem: (ctx: DriverContext & { nomePagador: string, nomePassageiro: string }): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const ref = ctx.mes ? ` referente a *${getMeshName(ctx.mes)}/${ctx.ano}*` : "";
        const nomePassageiro = getFirstName(ctx.nomePassageiro);
        const nomePag = getFirstName(ctx.nomePagador);

        return textPart(`✅ *Pagamento Recebido!*\n\n` +
            `A mensalidade do(a) *${nomePassageiro}* (${nomePag}) no valor de *${valor}*${ref} foi paga com sucesso.\n\n` +
            `O valor está sendo processado e logo estará disponível na sua conta. ✨ ⏳`);
    },

    /**
     * Confirmação de Pagamento de Assinatura (Recibo do Motorista)
     */
    paymentConfirmed: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const ref = ctx.mes ? ` referente a *${getMeshName(ctx.mes)}/${ctx.ano}*` : "";
        const nomeMot = getFirstName(ctx.nomeMotorista);
        const validade = ctx.dataVencimento ? `\n🗓️ *Validade do Plano:* ${formatDate(ctx.dataVencimento)}` : "";

        const text = `✅ *Pagamento Confirmado!*\n\n` +
            `Oi *${nomeMot}*, recebemos seu pagamento de *${valor}*${ref} referente ao plano *${ctx.nomePlano}*.\n` +
            `${validade}\n\n` +
            `Seu acesso está garantido! 🚐💨`;

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
            parts.push({
                type: "text",
                content: `⚠️ *Importante: Próximos Passos*\n\n` +
                    `Para aproveitar ao máximo a automação do Plano Profissional:\n\n` +
                    `1️⃣ *Cadastre sua Chave PIX*\n` +
                    `Acesse o App e cadastre sua chave para receber os pagamentos dos passageiros direto na sua conta bancária. 💸`,
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
        
        const text = `⏳ *Seu Teste Grátis está acabando!*\n\n` +
            `Oi *${getFirstName(ctx.nomeMotorista)}*, esperamos que esteja gostando da Van360! 🚌\n\n` +
            `Seu período de testes do plano *${ctx.nomePlano}* termina em *${data}*.\n\n` +
            `Para continuar usando todos os recursos sem interrupções, confirme sua assinatura agora:\n\n` +
            `💰 Valor: *${valor}*\n\n` +
            `PIX Copia e Cola 👇`;

        return buildPixMessageParts(text, ctx.pixPayload);
    },

    /**
     * Falha no Repasse (Invalidar Chave)
     */
    repasseFailed: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        return textPart(`⚠️ *Atenção: Falha no Repasse*\n\n` +
            `Oi *${getFirstName(ctx.nomeMotorista)}*, tentamos realizar o repasse de *${valor}*, mas o banco retornou um erro em sua chave PIX.\n\n` +
            `Por segurança, **sua chave PIX foi invalidada**. 🔒\n\n` +
            `Por favor, acesse o App e cadastre sua chave novamente para receber este valor.`);
    },
    /**
     * Reativação de Assinatura com Embargo de 24h
     */
    reactivationWithEmbargo: (ctx: DriverContext): CompositeMessagePart[] => {
        const nomeMot = getFirstName(ctx.nomeMotorista);
        const mes = getMeshName(ctx.mes);
        const ref = mes ? ` de *${mes}/${ctx.ano}*` : "";

        return textPart(`✅ *Sua Conta foi Reativada!*\n\n` +
            `Oi *${nomeMot}*, seu acesso ao sistema está liberado novamente! 🚐💨\n\n` +
            `Geramos as cobranças${ref} que estavam pendentes durante a suspensão.\n\n` +
            `⚠️ *IMPORTANTE:* A automação está **PAUSADA por 24 horas**. Aproveite esse tempo para conferir seu painel e dar baixa em quem já te pagou durante a suspensão. Assim, evitamos enviar lembretes duplicados aos pais. 🤝`);
    },


    /**
     * Notificação de Novo Pré-Cadastro
     */
    prePassengerCreated: (ctx: DriverContext): CompositeMessagePart[] => {
        const nomeMot = getFirstName(ctx.nomeMotorista);
        const nomePas = getFirstName(ctx.nomePassageiro) || "um novo passageiro";
        const nomeResp = ctx.nomeResponsavel ? ` (${getFirstName(ctx.nomeResponsavel)})` : "";

        return textPart(`🔔 *Novo Pré-Cadastro Realizado!*\n\n` +
            `Oi *${nomeMot}*, o pré-cadastro de *${nomePas}*${nomeResp} foi realizado com sucesso através do seu link! 🚀\n\n` +
            `Acesse o sistema para revisar os dados, definir o valor e aprovar o cadastro. Boas vendas! 🚐💨`);
    },

    /**
     * Sucesso na Validação da Chave PIX
     */
    /**
     * Sucesso na Validação da Chave PIX
     */
    pixKeyValidated: (ctx: DriverContext): CompositeMessagePart[] => {
        const nomeMot = getFirstName(ctx.nomeMotorista);
        const formattedKey = ctx.chavePix && ctx.tipoChavePix ? formatPixKey(ctx.chavePix, ctx.tipoChavePix) : "cadastrada";

        return textPart(`✅ *Chave PIX Validada!*\n\n` +
            `Oi *${nomeMot}*, sua chave PIX (*${formattedKey}*) foi validada com sucesso! 🎉\n\n` +
            `Agora você receberá os pagamentos dos passageiros diretamente em sua conta.`);
    },

    /**
     * Falha na Validação da Chave PIX
     */
    pixKeyValidationFailed: (ctx: DriverContext): CompositeMessagePart[] => {
        const nomeMot = getFirstName(ctx.nomeMotorista);
        
        return textPart(`❌ *Falha na Validação do PIX*\n\n` +
            `Oi *${nomeMot}*, o banco não conseguiu validar a chave PIX informada.\n\n` +
            `Isso geralmente ocorre se o CPF/CNPJ da chave não for o mesmo do titular da conta bancária. 🏦\n\n` +
            `Por favor, cadastre uma nova chave válida no aplicativo para começar a receber seus pagamentos.`);
    }
};
