import { CompositeMessagePart } from "../../../../types/dtos/evolution.dto.js";
import { CheckoutPaymentMethod } from "../../../../types/enums.js";
import { maskPhone, getFirstAndSecondName, formatCurrency } from "../../../../utils/format.js";
import { extractErrorMessage } from "../../../../utils/string.utils.js";

function formatSubscriptionPaymentMethod(
    metodoPagamento?: CheckoutPaymentMethod | string | null,
    parcelas?: number | null
): string | null {
    switch (metodoPagamento) {
        case CheckoutPaymentMethod.PIX:
            return "PIX";
        case CheckoutPaymentMethod.CREDIT_CARD:
            return parcelas && parcelas > 1
                ? `Cartão de Crédito (${parcelas}x)`
                : "Cartão de Crédito";
        case CheckoutPaymentMethod.APPLE_IAP:
            return "Apple (App Store)";
        case CheckoutPaymentMethod.BOLETO:
            return "Boleto";
        default:
            return null;
    }
}

export interface AdminRegistrationContext {
    nome: string;
    apelido?: string | null;
    telefone?: string;
    origem?: string;
    campanha?: string;
    dataRegistro: string;
    usuarioId: string;
}

export interface AdminSubscriptionContext {
    nomeMotorista: string;
    apelidoMotorista?: string | null;
    telefone: string;
    nomePlano: string;
    valor: string;
    dataVencimento: string;
    usuarioId: string;
    isFirstSubscription?: boolean;
    metodoPagamento?: CheckoutPaymentMethod | string | null;
    parcelas?: number | null;
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

export interface AdminRepasseSucessoContext {
    motoristaNome: string;
    motoristaApelido?: string | null;
    alunoNome: string;
    pagadorNome?: string | null;
    parcela: string;
    valorBruto: number;
    valorMultaJuros?: number;
    taxaPlataforma: number;
    valorLiquido: number;
    dataRepasse: string;
    repasseId: string;
    endToEndIdSaque?: string | null;
    endToEndIdEntrada?: string | null;
}

export interface AdminCobrancaAutomaticaAlteradaContext {
    motoristaNome: string;
    motoristaApelido?: string | null;
    telefone?: string | null;
    statusAssinaturaLabel: string;
    ativou: boolean;
    modoAnteriorLabel: string;
    modoNovoLabel: string;
    dataHora: string;
    usuarioId: string;
}

export class TelegramTemplates {
    static newRegistration(ctx: AdminRegistrationContext): CompositeMessagePart[] {
        const nomeCurto = getFirstAndSecondName(ctx.nome);
        const motoristaDisplay = ctx.apelido?.trim()
            ? `${ctx.apelido.trim()} (${nomeCurto})`
            : nomeCurto;

        const lines = [
            `👤 <b>Novo Cadastro no Van360!</b>\n`,
            `<b>Motorista:</b> ${motoristaDisplay}`
        ];
        if (ctx.telefone) {
            lines.push(`<b>Telefone:</b> ${maskPhone(ctx.telefone)}`);
        }
        if (ctx.origem) {
            lines.push(`<b>Origem:</b> ${ctx.origem}${ctx.campanha ? ` • ${ctx.campanha}` : ""}`);
        }
        lines.push(`<b>Data:</b> ${ctx.dataRegistro}`);
        lines.push(`<b>ID:</b> ${ctx.usuarioId}`);

        return [
            {
                type: "text",
                content: lines.join("\n")
            }
        ];
    }

    static newSubscription(ctx: AdminSubscriptionContext): CompositeMessagePart[] {
        const motoristaDisplay = ctx.apelidoMotorista?.trim() || getFirstAndSecondName(ctx.nomeMotorista);
        const isRenovacao = ctx.isFirstSubscription === false;
        const titulo = isRenovacao
            ? `🔄 <b>Renovação Paga</b>`
            : `✅ <b>Novo Assinante</b>`;
        const formaPagamentoLabel = formatSubscriptionPaymentMethod(ctx.metodoPagamento, ctx.parcelas);

        const lines = [
            `${titulo}\n`,
            `<b>Motorista:</b> ${motoristaDisplay}`
        ];
        if (ctx.telefone) {
            lines.push(`<b>Telefone:</b> ${maskPhone(ctx.telefone)}`);
        }
        lines.push(`<b>Plano:</b> ${ctx.nomePlano}`);
        if (formaPagamentoLabel) {
            lines.push(`<b>Pagamento:</b> ${formaPagamentoLabel}`);
        }
        lines.push(`<b>Valor:</b> ${ctx.valor}`);
        lines.push(`<b>Vencimento:</b> ${ctx.dataVencimento}`);
        lines.push(`<b>ID:</b> ${ctx.usuarioId}`);

        return [
            {
                type: "text",
                content: lines.join("\n")
            }
        ];
    }

    static repasseSuccess(ctx: AdminRepasseSucessoContext): CompositeMessagePart[] {
        const motoristaNomeCurto = getFirstAndSecondName(ctx.motoristaNome);
        const motoristaDisplay = ctx.motoristaApelido?.trim()
            ? `${ctx.motoristaApelido.trim()} (${motoristaNomeCurto})`
            : motoristaNomeCurto;

        const alunoCurto = getFirstAndSecondName(ctx.alunoNome);
        const pagadorDisplay = ctx.pagadorNome?.trim() || "Não identificado";

        const valorBrutoFmt = formatCurrency(ctx.valorBruto);
        const multaJurosTexto = ctx.valorMultaJuros && ctx.valorMultaJuros > 0
            ? ` (inclui ${formatCurrency(ctx.valorMultaJuros)} de multa e juros)`
            : "";
        const taxaFmt = formatCurrency(ctx.taxaPlataforma);
        const valorLiquidoFmt = formatCurrency(ctx.valorLiquido);

        const lines = [
            `💸 <b>Repasse Pix Realizado!</b>\n`,
            `<b>Motorista:</b> ${motoristaDisplay}`,
            `<b>Aluno:</b> ${alunoCurto}`,
            `<b>Quem pagou:</b> ${pagadorDisplay}`,
            `<b>Parcela:</b> ${ctx.parcela}\n`,
            `<b>Valor Pago:</b> ${valorBrutoFmt}${multaJurosTexto}`,
            `<b>Taxa Van360:</b> ${taxaFmt}`,
            `<b>Valor Repassado:</b> ${valorLiquidoFmt}\n`,
            `<b>Data do Repasse:</b> ${ctx.dataRepasse}`,
            `<b>ID Repasse:</b> <code>${ctx.repasseId}</code>`
        ];

        if (ctx.endToEndIdSaque) {
            lines.push(`<b>End-to-End (Saque):</b> <code>${ctx.endToEndIdSaque}</code>`);
        }
        if (ctx.endToEndIdEntrada) {
            lines.push(`<b>End-to-End (Entrada):</b> <code>${ctx.endToEndIdEntrada}</code>`);
        }

        return [
            {
                type: "text",
                content: lines.join("\n")
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

    static cobrancaAutomaticaAlterada(ctx: AdminCobrancaAutomaticaAlteradaContext): CompositeMessagePart[] {
        const nomeCurto = getFirstAndSecondName(ctx.motoristaNome);
        const motoristaDisplay = ctx.motoristaApelido?.trim()
            ? `${ctx.motoristaApelido.trim()} (${nomeCurto})`
            : nomeCurto;

        const cabecalho = ctx.ativou
            ? `⚡ <b>Cobrança Automática Ativada!</b>`
            : `🔄 <b>Cobrança Automática Desativada</b>`;

        const lines = [
            `${cabecalho}\n`,
            `<b>Motorista:</b> ${motoristaDisplay}`
        ];

        if (ctx.telefone) {
            lines.push(`<b>Telefone:</b> ${maskPhone(ctx.telefone)}`);
        }

        lines.push(`<b>Assinatura:</b> ${ctx.statusAssinaturaLabel}`);
        lines.push(`<b>Mudança:</b> ${ctx.modoAnteriorLabel} ➡️ ${ctx.modoNovoLabel}`);
        lines.push(`<b>Data:</b> ${ctx.dataHora}`);
        lines.push(`<b>ID:</b> <code>${ctx.usuarioId}</code>`);

        return [
            {
                type: "text",
                content: lines.join("\n")
            }
        ];
    }
}
