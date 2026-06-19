import { CompositeMessagePart } from "../../../types/dtos/whatsapp.dto.js";
import { maskCpf, maskCnpj, maskPhone } from "../../../utils/format.js";

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
}
