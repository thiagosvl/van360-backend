import { NotificationUrlBuilder } from "../../utils/notification-url.builder.js";
import { NotificationContextFormatter } from "../../utils/notification-context.formatter.js";
import { WabaTemplateNameEnum } from "../../../../types/enums.js";

export interface WabaParameter {
    type: "text" | "currency" | "date_time" | "document" | "image";
    text?: string;
    document?: { link: string; filename?: string };
    image?: { link: string };
}

export interface WabaComponent {
    type: "header" | "body" | "button";
    sub_type?: "url" | "quick_reply";
    index?: string;
    parameters: WabaParameter[];
}

export interface WabaTemplatePayload {
    templateName: string;
    languageCode?: string;
    components: WabaComponent[];
}

export class WabaTemplates {

    static vencimentoProximo(ctx: Record<string, unknown>): WabaTemplatePayload {
        const respName = NotificationContextFormatter.getFirstName(ctx.nomeResponsavel as string, "Responsável");
        const passName = NotificationContextFormatter.getFirstName(ctx.nomePassageiro as string, "Passageiro");
        const valorStr = NotificationContextFormatter.formatRawValue(ctx.valor as number | string);
        const dataStr = NotificationContextFormatter.formatDate(ctx.dataVencimento as string);
        const rawPixKey = (ctx.pixCopiaECola || ctx.chavePix) as string | undefined;

        if (!rawPixKey || !rawPixKey.trim()) {
            return {
                templateName: WabaTemplateNameEnum.PAIS_VENCIMENTO_PROXIMO_SEM_PIX,
                languageCode: "pt_BR",
                components: [
                    {
                        type: "body",
                        parameters: [
                            { type: "text", text: respName },
                            { type: "text", text: passName },
                            { type: "text", text: dataStr },
                            { type: "text", text: valorStr }
                        ]
                    }
                ]
            };
        }

        return {
            templateName: WabaTemplateNameEnum.PAIS_VENCIMENTO_PROXIMO_PIX,
            languageCode: "pt_BR",
            components: [
                {
                    type: "body",
                    parameters: [
                        { type: "text", text: respName },
                        { type: "text", text: passName },
                        { type: "text", text: dataStr },
                        { type: "text", text: valorStr }
                    ]
                },
                {
                    type: "button",
                    sub_type: "url",
                    index: "0",
                    parameters: [
                        { type: "text", text: rawPixKey.trim() }
                    ]
                }
            ]
        };
    }

    static vencimentoHoje(ctx: Record<string, unknown>): WabaTemplatePayload {
        const respName = NotificationContextFormatter.getFirstName(ctx.nomeResponsavel as string, "Responsável");
        const passName = NotificationContextFormatter.getFirstName(ctx.nomePassageiro as string, "Passageiro");
        const valorStr = NotificationContextFormatter.formatRawValue(ctx.valor as number | string);
        const rawPixKey = (ctx.pixCopiaECola || ctx.chavePix) as string | undefined;

        if (!rawPixKey || !rawPixKey.trim()) {
            return {
                templateName: WabaTemplateNameEnum.PAIS_VENCIMENTO_HOJE_SEM_PIX,
                languageCode: "pt_BR",
                components: [
                    {
                        type: "body",
                        parameters: [
                            { type: "text", text: respName },
                            { type: "text", text: passName },
                            { type: "text", text: valorStr }
                        ]
                    }
                ]
            };
        }

        return {
            templateName: WabaTemplateNameEnum.PAIS_VENCIMENTO_HOJE_PIX,
            languageCode: "pt_BR",
            components: [
                {
                    type: "body",
                    parameters: [
                        { type: "text", text: respName },
                        { type: "text", text: passName },
                        { type: "text", text: valorStr }
                    ]
                },
                {
                    type: "button",
                    sub_type: "url",
                    index: "0",
                    parameters: [
                        { type: "text", text: rawPixKey.trim() }
                    ]
                }
            ]
        };
    }

    static cobrancaAtrasado(ctx: Record<string, unknown>): WabaTemplatePayload {
        const respName = NotificationContextFormatter.getFirstName(ctx.nomeResponsavel as string, "Responsável");
        const passName = NotificationContextFormatter.getFirstName(ctx.nomePassageiro as string, "Passageiro");
        const valorStr = NotificationContextFormatter.formatRawValue(ctx.valor as number | string);
        const mesLabel = NotificationContextFormatter.getMonthLabel(ctx.mes as number | string);
        const rawPixKey = (ctx.pixCopiaECola || ctx.chavePix) as string | undefined;

        if (!rawPixKey || !rawPixKey.trim()) {
            return {
                templateName: WabaTemplateNameEnum.PAIS_ATRASADO_SEM_PIX,
                languageCode: "pt_BR",
                components: [
                    {
                        type: "body",
                        parameters: [
                            { type: "text", text: respName },
                            { type: "text", text: passName },
                            { type: "text", text: mesLabel },
                            { type: "text", text: valorStr }
                        ]
                    }
                ]
            };
        }

        return {
            templateName: WabaTemplateNameEnum.PAIS_ATRASADO_PIX,
            languageCode: "pt_BR",
            components: [
                {
                    type: "body",
                    parameters: [
                        { type: "text", text: respName },
                        { type: "text", text: passName },
                        { type: "text", text: mesLabel },
                        { type: "text", text: valorStr }
                    ]
                },
                {
                    type: "button",
                    sub_type: "url",
                    index: "0",
                    parameters: [
                        { type: "text", text: rawPixKey.trim() }
                    ]
                }
            ]
        };
    }

    static paymentReceipt(ctx: Record<string, unknown>): WabaTemplatePayload {
        const respName = NotificationContextFormatter.getFirstName(ctx.nomeResponsavel as string, "Responsável");
        const passName = NotificationContextFormatter.getFirstName(ctx.nomePassageiro as string, "Passageiro");
        const valorStr = NotificationContextFormatter.formatRawValue(ctx.valor as number | string);
        const mesLabel = NotificationContextFormatter.getMonthLabel(ctx.mes as number | string);
        const reciboUrl = (ctx.reciboUrl || ctx.mediaUrl || "") as string;

        const components: WabaComponent[] = [];

        if (reciboUrl) {
            components.push({
                type: "header",
                parameters: [
                    { type: "image", image: { link: reciboUrl } }
                ]
            });
        }

        components.push({
            type: "body",
            parameters: [
                { type: "text", text: respName },
                { type: "text", text: mesLabel },
                { type: "text", text: passName },
                { type: "text", text: valorStr }
            ]
        });

        return {
            templateName: WabaTemplateNameEnum.PAIS_RECIBO,
            languageCode: "pt_BR",
            components
        };
    }

    static contratoDisponivel(ctx: Record<string, unknown>): WabaTemplatePayload {
        const respName = NotificationContextFormatter.getFirstName(ctx.nomeResponsavel as string, "Responsável");
        const passName = NotificationContextFormatter.getFirstName(ctx.nomePassageiro as string, "Passageiro");
        
        const rawTokenOrLink = (ctx.linkAssinatura || ctx.linkContrato || ctx.contratoUrl || ctx.tokenAssinatura || ctx.token || "") as string;
        const fullContractUrl = NotificationUrlBuilder.getContractSignatureUrl(rawTokenOrLink);
        const tokenOrLink = NotificationUrlBuilder.extractWabaDynamicToken(fullContractUrl);

        return {
            templateName: WabaTemplateNameEnum.PAIS_CONTRATO,
            languageCode: "pt_BR",
            components: [
                {
                    type: "body",
                    parameters: [
                        { type: "text", text: respName },
                        { type: "text", text: passName }
                    ]
                },
                {
                    type: "button",
                    sub_type: "url",
                    index: "0",
                    parameters: [
                        { type: "text", text: tokenOrLink }
                    ]
                }
            ]
        };
    }

    static subscriptionDueSoon(ctx: Record<string, unknown>): WabaTemplatePayload {
        const driverName = NotificationContextFormatter.getFirstName(ctx.nomeMotorista as string, "Motorista");
        const valorStr = NotificationContextFormatter.formatValue(ctx.valor as number | string);
        const dataStr = NotificationContextFormatter.formatDate(ctx.dataVencimento as string);
        const planoStr = (ctx.planoNome as string) || "Plano Mensal";

        const rawLink = NotificationUrlBuilder.getExternalCheckoutBridgeUrl({
            autoOpen: false,
            token: (ctx.tokenCheckout || ctx.token) as string
        });
        const tokenOrLink = NotificationUrlBuilder.extractWabaDynamicToken(rawLink);

        return {
            templateName: WabaTemplateNameEnum.MOTORISTA_RENOVACAO_PIX,
            languageCode: "pt_BR",
            components: [
                {
                    type: "body",
                    parameters: [
                        { type: "text", text: driverName },
                        { type: "text", text: valorStr },
                        { type: "text", text: planoStr },
                        { type: "text", text: dataStr }
                    ]
                },
                {
                    type: "button",
                    sub_type: "url",
                    index: "0",
                    parameters: [
                        { type: "text", text: tokenOrLink }
                    ]
                }
            ]
        };
    }

    static subscriptionFailedCC(ctx: Record<string, unknown>): WabaTemplatePayload {
        const driverName = NotificationContextFormatter.getFirstName(ctx.nomeMotorista as string, "Motorista");

        const rawLink = NotificationUrlBuilder.getExternalCheckoutBridgeUrl({
            autoOpen: true,
            token: (ctx.tokenCheckout || ctx.token) as string
        });
        const tokenOrLink = NotificationUrlBuilder.extractWabaDynamicToken(rawLink);

        return {
            templateName: WabaTemplateNameEnum.MOTORISTA_FALHA_CARTAO,
            languageCode: "pt_BR",
            components: [
                {
                    type: "body",
                    parameters: [
                        { type: "text", text: driverName }
                    ]
                },
                {
                    type: "button",
                    sub_type: "url",
                    index: "0",
                    parameters: [
                        { type: "text", text: tokenOrLink }
                    ]
                }
            ]
        };
    }
}

