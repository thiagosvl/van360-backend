import { formatToBrazilianDate, getMonthNameBR, toLocalDateString } from "../../../utils/date.utils.js";
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
    skipPixStep?: boolean; 
    chavePix?: string;
    tipoChavePix?: string;
}

// Removidos métodos locais pois agora usamos os utilitários centralizados

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
    const caption = `${text}\n\n💡 Pague pelo app do seu banco. Não precisa enviar comprovante, o sistema identifica automaticamente.`;

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
        const validade = ctx.dataVencimento ? formatToBrazilianDate(ctx.dataVencimento) : "";
        const validadeMsg = validade ? ` válido até *${validade}*` : "";

        return textPart(`🚀 *Bem-vindo(a) à Van360*\n\n` +
            `O plano *${ctx.nomePlano}* foi ativado com sucesso.\n` +
            `Seu acesso completo de *${dias} dias* de teste grátis é${validadeMsg}.\n` +
            `Bora decolar! 🚐💨`);
    },

    /**
     * Ativação: Faça o pagamento para começar
     */
    activation: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const text = `⏳ *Ativação Pendente*\n\n` +
            `Seu plano *${ctx.nomePlano}* no valor de *${valor}* aguarda pagamento para ativação.\n` +
            `Realize o pagamento pelo PIX abaixo para liberar o acesso imediatamente.`;

        return buildPixMessageParts(text, ctx.pixPayload);
    },

    /**
     * Renovação: Genérica (Uso manual ou info)
     */
    renewal: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const data = formatToBrazilianDate(ctx.dataVencimento);
        const text = `🗓️ *Renovação Próxima*\n\n` +
            `Sua assinatura do plano *${ctx.nomePlano}* vence em *${data}*.\n` +
            `Valor: *${valor}*\n\n` +
            `Realize o pagamento pelo PIX abaixo para evitar bloqueios no sistema.`;

        return buildPixMessageParts(text, ctx.pixPayload);
    },

    /**
     * Renovação: Aviso Prévio (X dias antes)
     */
    renewalDueSoon: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const data = formatToBrazilianDate(ctx.dataVencimento);
        const text = `🗓️ *Renovação Próxima*\n\n` +
            `Sua assinatura do plano *${ctx.nomePlano}* vence em *${data}*.\n` +
            `Valor: *${valor}*\n\n` +
            `Realize o pagamento pelo PIX abaixo para evitar bloqueios no sistema.`;
        
        return buildPixMessageParts(text, ctx.pixPayload);
    },

    /**
     * Renovação: Vence Hoje
     */
    renewalDueToday: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const data = formatToBrazilianDate(ctx.dataVencimento);
        const text = `⚠️ *Vencimento Hoje*\n\n` +
            `Sua assinatura do plano *${ctx.nomePlano}* vence *HOJE* (*${data}*).\n` +
            `Valor: *${valor}*\n\n` +
            `Realize o pagamento pelo PIX abaixo para garantir seu acesso.`;

        return buildPixMessageParts(text, ctx.pixPayload);
    },

    /**
     * Renovação: Atrasado (Ainda não suspenso)
     */
    renewalOverdue: (ctx: DriverContext & { diasAtraso?: number }): CompositeMessagePart[] => {
        const dias = ctx.diasAtraso ? `há ${ctx.diasAtraso} dias` : "em atraso";
        const text = `⚠️ *Mensalidade Pendente*\n\n` +
            `A assinatura do sistema está vencida *${dias}*.\n` +
            `Regularize o pagamento pelo PIX abaixo para prevenir a suspensão automática das funcionalidades.`;
        return buildPixMessageParts(text, ctx.pixPayload);
    },

    /**
     * Acesso Suspenso (Bloqueado)
     */
    accessSuspended: (ctx: DriverContext): CompositeMessagePart[] => {
        const text = `🚫 *Acesso Limitado*\n\n` +
            `Devido à falta de pagamento, seu acesso ao sistema foi restrito. Novas ações estão bloqueadas.\n` +
            `Realize o pagamento pelo PIX abaixo para normalizar o serviço instantaneamente.`;
        return buildPixMessageParts(text, ctx.pixPayload);
    },

    /**
     * Solicitação de Upgrade / Adicional
     */
    upgradeRequest: (ctx: DriverContext): CompositeMessagePart[] => {
         const text = `🚀 *Solicitação de Upgrade*\n\n` +
            `O pedido para alteração para o plano *${ctx.nomePlano}* foi recebido.\n` +
            `Para efetivar a mudança imediatamente, realize o pagamento da diferença abaixo.`;
         return buildPixMessageParts(text, ctx.pixPayload);
    },
    


    /**
     * Confirmação de Pagamento de Assinatura (Recibo do Motorista)
     */
    paymentConfirmed: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const ref = ctx.mes ? `\nReferência: *${getMonthNameBR(ctx.mes)}/${ctx.ano}*` : "";
        const validade = ctx.dataVencimento ? `\nNova validade: *${formatToBrazilianDate(ctx.dataVencimento)}*` : "";

        const text = `✅ *Assinatura Confirmada*\n\n` +
            `Pagamento de *${valor}* recebido com sucesso.\n` +
            `Plano: *${ctx.nomePlano}*` +
            `${ref}` +
            `${validade}`;

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
        const isProfessional = ctx.nomePlano.toLowerCase().includes("profissional");
        
        if (ctx.isActivation && isProfessional && !ctx.skipPixStep) {
            parts.push({
                type: "text",
                content: `⚠️ *Próximos Passos*\n\n` +
                    `Acesse o aplicativo e cadastre sua Chave PIX para receber os pagamentos dos responsáveis diretamente em sua conta bancária.`,
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
        const data = formatToBrazilianDate(ctx.dataVencimento);
        
        const text = `⏳ *Fim do Período de Testes*\n\n` +
            `Seu teste grátis do plano *${ctx.nomePlano}* termina em *${data}*.\n` +
            `Valor para renovação: *${valor}*\n\n` +
            `Realize o pagamento pelo PIX abaixo para manter seu acesso completo sem interrupções.`;

        return buildPixMessageParts(text, ctx.pixPayload);
    },

    /**
     * Falha no Repasse (Invalidar Chave)
     */
    repasseFailed: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        return textPart(`❌ *Erro na Transferência PIX*\n\n` +
            `A tentativa de transferir *${valor}* falhou. O banco retornou um erro na sua chave PIX.\n` +
            `Sua chave PIX foi invalidada por segurança. Acesse o aplicativo e cadastre uma nova chave válida para receber os valores retidos.`);
    },
    /**
     * Sucesso no Repasse (Liquidado na Conta)
     */
    repasseSuccess: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor);
        const data = ctx.dataVencimento ? formatToBrazilianDate(ctx.dataVencimento) : formatToBrazilianDate(toLocalDateString(new Date()));
        const ref = ctx.mes ? `*${getMonthNameBR(ctx.mes)}/${ctx.ano}*` : "";
        const passageiro = ctx.nomePassageiro ? `\n👤 Passageiro: *${getFirstName(ctx.nomePassageiro)}*` : "";

        return textPart(`💰 *Transferência Finalizada*\n\n` +
            `O valor de *${valor}* foi depositado em sua conta bancária.\n\n` +
            `*Detalhes do Pagamento:*` +
            `${passageiro}` +
            (ref ? `\n📅 Referência: ${ref}` : "") +
            `\n🏦 Data do depósito: *${data}*\n\n` +
            `_O valor já deve estar disponível em sua conta via PIX._`);
    },
    reactivationWithEmbargo: (ctx: DriverContext): CompositeMessagePart[] => {
        const mes = getMonthNameBR(ctx.mes);
        const ref = mes ? ` de *${mes}/${ctx.ano}*` : "";

        return textPart(`✅ *Conta Reativada*\n\n` +
            `Seu acesso ao sistema foi restaurado.\n` +
            `As cobranças${ref} referentes ao período suspenso foram geradas automaticamente.\n\n` +
            `⚠️ *ATENÇÃO:* A automação de cobranças ficará pausada nas próximas 24h. Acesse o painel e dê baixa nos pagamentos recebidos "por fora" para evitar lembretes indevidos aos pais.`);
    },


    /**
     * Notificação de Novo Pré-Cadastro
     */
    prePassengerCreated: (ctx: DriverContext): CompositeMessagePart[] => {
        const nomePas = getFirstName(ctx.nomePassageiro) || "um novo passageiro";
        const nomeResp = ctx.nomeResponsavel ? ` (Responsável: ${getFirstName(ctx.nomeResponsavel)})` : "";

        return textPart(`🔔 *Novo Pré-Cadastro Recebido*\n\n` +
            `O pré-cadastro de *${nomePas}*${nomeResp} foi efetuado via link da sua Van.\n` +
            `Acesse o sistema para revisar os dados, definir os valores e aprovar o cadastro.`);
    },

    /**
     * Sucesso na Validação da Chave PIX
     */
    pixKeyValidated: (ctx: DriverContext): CompositeMessagePart[] => {
        const formattedKey = ctx.chavePix && ctx.tipoChavePix ? formatPixKey(ctx.chavePix, ctx.tipoChavePix) : "cadastrada";

        return textPart(`✅ *Chave PIX Validada*\n\n` +
            `A chave PIX (*${formattedKey}*) foi aprovada.\n` +
            `Sua conta está apta para receber as transferências automáticas das mensalidades.`);
    },

    /**
     * Falha na Validação da Chave PIX
     */
    pixKeyValidationFailed: (ctx: DriverContext): CompositeMessagePart[] => {
        const formattedKey = ctx.chavePix && ctx.tipoChavePix ? formatPixKey(ctx.chavePix, ctx.tipoChavePix) : (ctx.chavePix || "informada");

        return textPart(`❌ *Falha de Validação PIX*\n\n` +
            `O banco não pôde aprovar a chave PIX (*${formattedKey}*). O documento atrelado à chave deve ser idêntico ao titular da conta.\n` +
            `Cadastre uma nova chave PIX ativa no aplicativo.`);
    }
};
