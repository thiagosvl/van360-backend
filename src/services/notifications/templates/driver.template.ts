import { formatToBrazilianDate, getMonthNameBR, toLocalDateString } from "../../../utils/date.utils.js";
import { formatCurrency, formatPixKey, getFirstName } from "../../../utils/format.js";

/**
 * Templates de Mensagem para Motoristas / Assinantes do Sistema
 */

export interface DriverContext {
    nomeMotorista: string;
    valor?: number;
    dataVencimento?: string;
    mes?: number;
    ano?: number;
    reciboUrl?: string; // URL da imagem do comprovante
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
     * Boas-vindas: Onboarding concluído
     */
    welcomeTrial: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`🚀 *Bem-vindo(a) à Van360*\n\n` +
            `Sua conta foi criada com sucesso e já está pronta para uso.\n\n` +
            `⚠️ *Próximos Passos*\n` +
            `• Configurar seu contrato padrão\n` +
            `• Cadastrar seus primeiros passageiros`);
    },

    /**
     * Ativação: Conta Pronta
     */
    activation: (ctx: DriverContext): CompositeMessagePart[] => {
        return textPart(`✅ *Conta Ativada*\n\n` +
            `Seu acesso ao Van360 está liberado.\n` +
            `Aproveite todas as funcionalidades de gestão e automação sem custos.`);
    },

    /**
     * Confirmação de Pagamento de Assinatura (Recibo do Motorista)
     */
    paymentConfirmed: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor ?? 0);
        const ref = ctx.mes ? `\nReferência: *${getMonthNameBR(ctx.mes)}/${ctx.ano}*` : "";
        const validade = ctx.dataVencimento ? `\nNova validade: *${formatToBrazilianDate(ctx.dataVencimento)}*` : "";

        const text = `✅ *Confirmação de Recebimento*\n\n` +
            `Pagamento de *${valor}* processado com sucesso.\n` +
            `Referência: *Sistema*` +
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

        // 2. Lembretes Importantes (Onboarding)
        if (ctx.isActivation && !ctx.skipPixStep) {
            parts.push({
                type: "text",
                content: `⚠️ *Próximos Passos*\n` +
                    `• Configurar Contrato\n` +
                    `• Cadastrar Chave PIX`,
                delayMs: 1500
            });
        }
        
        return parts;
    },

    /**
     * Falha no Repasse (Invalidar Chave)
     */
    repasseFailed: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor ?? 0);
        return textPart(`❌ *Erro na Transferência PIX*\n\n` +
            `A tentativa de transferir *${valor}* falhou. O banco retornou um erro na sua chave PIX.\n` +
            `Sua chave PIX foi invalidada por segurança. Acesse o aplicativo e cadastre uma nova chave válida para receber os valores retidos.`);
    },
    /**
     * Sucesso no Repasse (Liquidado na Conta)
     */
    repasseSuccess: (ctx: DriverContext): CompositeMessagePart[] => {
        const valor = formatCurrency(ctx.valor ?? 0);
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
