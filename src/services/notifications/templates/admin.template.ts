import { CompositeMessagePart } from "../../../types/dtos/whatsapp.dto.js";
import { maskCpf, maskCnpj, maskPhone } from "../../../utils/format.js";
import { extractErrorMessage } from "../../../utils/string.utils.js";

export interface AdminRegistrationContext {
    nome: string;
    email: string;
    telefone?: string;
    cpfcnpj?: string;
    dataRegistro: string;
    usuarioId: string;
}

export interface AdminSubscriptionContext {
    nomeMotorista: string;
    telefone: string;
    nomePlano: string;
    valor: string;
    dataVencimento: string;
    usuarioId: string;
}

export interface AdminPaymentFailedContext {
    nomeMotorista: string;
    telefone?: string;
    usuarioId: string;
    erro: string;
    planoNome?: string;
    origem?: "MANUAL" | "AUTOMATICO";
}

export interface AdminSystemAlertContext {
    titulo: string;
    mensagem: string;
    detalhes?: Record<string, string>;
}

export class AdminTemplates {
    static newRegistration(ctx: AdminRegistrationContext): CompositeMessagePart[] {
        const cpfcnpjClean = ctx.cpfcnpj?.replace(/\D/g, "") || "";
        const docFormatado = cpfcnpjClean ? (cpfcnpjClean.length > 11 ? maskCnpj(cpfcnpjClean) : maskCpf(cpfcnpjClean)) : "";
        
        const telLine = ctx.telefone ? `<b>Telefone:</b> ${maskPhone(ctx.telefone)}\n` : "";
        const docLine = docFormatado ? `<b>CPF/CNPJ:</b> ${docFormatado}\n` : "";

        return [
            {
                type: "text",
                content: `👤 <b>Novo Cadastro no Van360!</b>\n\n` +
                         `<b>Nome:</b> ${ctx.nome}\n` +
                         `<b>Email:</b> ${ctx.email}\n` +
                         telLine +
                         docLine +
                         `<b>Data:</b> ${ctx.dataRegistro}\n` +
                         `<b>ID:</b> ${ctx.usuarioId}`
            }
        ];
    }

    static newSubscription(ctx: AdminSubscriptionContext): CompositeMessagePart[] {
        const telLine = ctx.telefone ? `<b>Telefone:</b> ${maskPhone(ctx.telefone)}\n` : "";

        return [
            {
                type: "text",
                content: `✅ <b>Nova Assinatura Paga!</b>\n\n` +
                         `<b>Motorista:</b> ${ctx.nomeMotorista}\n` +
                         telLine +
                         `<b>Plano:</b> ${ctx.nomePlano}\n` +
                         `<b>Valor:</b> ${ctx.valor}\n` +
                         `<b>Vencimento:</b> ${ctx.dataVencimento}\n` +
                         `<b>ID:</b> ${ctx.usuarioId}`
            }
        ];
    }

    static subscriptionCanceled(ctx: AdminSubscriptionContext): CompositeMessagePart[] {
        const telLine = ctx.telefone && ctx.telefone !== "Não informado" ? `<b>Telefone:</b> ${maskPhone(ctx.telefone)}\n` : "";

        return [
            {
                type: "text",
                content: `🚨 <b>ALERTA DE CHURN (Cancelamento)</b>\n\n` +
                         `Um usuário acabou de cancelar a assinatura.\n\n` +
                         `<b>Motorista:</b> ${ctx.nomeMotorista}\n` +
                         telLine +
                         `<b>Plano:</b> ${ctx.nomePlano}\n` +
                         `<b>ID:</b> ${ctx.usuarioId}\n\n` +
                         `<i>Recomendamos entrar em contato imediatamente para entender o motivo e tentar reversão!</i>`
            }
        ];
    }

    static paymentFailed(ctx: AdminPaymentFailedContext): CompositeMessagePart[] {
        const telLine = ctx.telefone && ctx.telefone !== "Não informado" ? `<b>Telefone:</b> ${maskPhone(ctx.telefone)}\n` : "";
        const planLine = ctx.planoNome ? `<b>Plano:</b> ${ctx.planoNome}\n` : "";
        const isManual = ctx.origem === "MANUAL";
        const origemText = isManual ? "Checkout Manual (Tentativa do Usuário)" : "Renovação Automática (Robô)";
        const descText = isManual
            ? "Tentativa manual de pagamento/checkout com cartão recusada."
            : "O sistema não conseguiu renovar a assinatura de um cliente automaticamente.";
        const footerText = isManual
            ? "<i>Verifique a tentativa de pagamento se necessário.</i>"
            : "<i>O cliente já foi notificado. Acompanhe se ele atualizará o cartão.</i>";

        const errorText = extractErrorMessage(ctx.erro, "Sem detalhe");

        return [
            {
                type: "text",
                content: `⚠️ <b>Falha de Cobrança (Cartão)</b>\n\n` +
                         `${descText}\n\n` +
                         `<b>Motorista:</b> ${ctx.nomeMotorista}\n` +
                         telLine +
                         planLine +
                         `<b>Origem:</b> ${origemText}\n` +
                         `<b>Motivo/Erro:</b> ${errorText}\n` +
                         `<b>ID:</b> ${ctx.usuarioId}\n\n` +
                         footerText
            }
        ];
    }

    static systemAlert(ctx: AdminSystemAlertContext): CompositeMessagePart[] {
        let detalhesText = "";
        if (ctx.detalhes && Object.keys(ctx.detalhes).length > 0) {
            detalhesText = "\n\n" + Object.entries(ctx.detalhes)
                .map(([key, value]) => `<b>${key}:</b> ${value}`)
                .join("\n");
        }

        return [
            {
                type: "text",
                content: `🚨 <b>${ctx.titulo}</b>\n\n` +
                         `${ctx.mensagem}` +
                         detalhesText
            }
        ];
    }
}
