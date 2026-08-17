import { NotificationUrlBuilder } from "../../utils/notification-url.builder.js";
import { NotificationContextFormatter } from "../../utils/notification-context.formatter.js";
import {
    WabaTemplateNameEnum,
    WabaComponentTypeEnum,
    WabaButtonSubTypeEnum,
    WabaParameterTypeEnum,
    WabaPaymentTypeEnum,
    WabaPixKeyTypeEnum
} from "../../../../types/enums.js";

export interface WabaParameter {
    type: WabaParameterTypeEnum;
    text?: string;
    document?: { link: string; filename?: string };
    image?: { link: string };
    action?: Record<string, unknown>;
}

export interface WabaComponent {
    type: WabaComponentTypeEnum;
    sub_type?: WabaButtonSubTypeEnum;
    index?: string;
    parameters: WabaParameter[];
}

export interface WabaTemplatePayload {
    templateName: string;
    languageCode?: string;
    components: WabaComponent[];
}

export class WabaTemplates {

    private static buildPixButtonComponent(ctx: Record<string, unknown>): WabaComponent | null {
        const rawPixKey = (ctx.pixCopiaECola || ctx.chavePix) as string | undefined;
        if (!rawPixKey || !rawPixKey.trim()) return null;

        const pixStr = rawPixKey.trim();

        const paymentSetting: Record<string, unknown> = {
            type: WabaPaymentTypeEnum.PIX_DYNAMIC_CODE,
            pix_dynamic_code: {
                code: pixStr
            }
        };

        return {
            type: WabaComponentTypeEnum.BUTTON,
            sub_type: WabaButtonSubTypeEnum.PAYMENT_REQUEST,
            index: "0",
            parameters: [
                {
                    type: WabaParameterTypeEnum.ACTION,
                    action: {
                        payment_request: {
                            payment_setting: paymentSetting
                        }
                    }
                }
            ]
        };
    }

    static vencimentoProximo(ctx: Record<string, unknown>): WabaTemplatePayload {
        const respName = NotificationContextFormatter.getFirstName(ctx.nomeResponsavel as string, "Responsável");
        const passName = NotificationContextFormatter.getFirstName(ctx.nomePassageiro as string, "Passageiro");
        const valorStr = NotificationContextFormatter.formatRawValue(ctx.valor as number | string);
        const dataStr = NotificationContextFormatter.formatDate(ctx.dataVencimento as string);
        
        const pixButton = this.buildPixButtonComponent(ctx);

        if (!pixButton) {
            return {
                templateName: WabaTemplateNameEnum.PAIS_VENCIMENTO_PROXIMO_SEM_PIX,
                languageCode: "pt_BR",
                components: [
                    {
                        type: WabaComponentTypeEnum.BODY,
                        parameters: [
                            { type: WabaParameterTypeEnum.TEXT, text: respName },
                            { type: WabaParameterTypeEnum.TEXT, text: passName },
                            { type: WabaParameterTypeEnum.TEXT, text: dataStr },
                            { type: WabaParameterTypeEnum.TEXT, text: valorStr }
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
                    type: WabaComponentTypeEnum.BODY,
                    parameters: [
                        { type: WabaParameterTypeEnum.TEXT, text: respName },
                        { type: WabaParameterTypeEnum.TEXT, text: passName },
                        { type: WabaParameterTypeEnum.TEXT, text: dataStr },
                        { type: WabaParameterTypeEnum.TEXT, text: valorStr }
                    ]
                },
                pixButton
            ]
        };
    }

    static vencimentoHoje(ctx: Record<string, unknown>): WabaTemplatePayload {
        const respName = NotificationContextFormatter.getFirstName(ctx.nomeResponsavel as string, "Responsável");
        const passName = NotificationContextFormatter.getFirstName(ctx.nomePassageiro as string, "Passageiro");
        const valorStr = NotificationContextFormatter.formatRawValue(ctx.valor as number | string);
        
        const pixButton = this.buildPixButtonComponent(ctx);

        if (!pixButton) {
            return {
                templateName: WabaTemplateNameEnum.PAIS_VENCIMENTO_HOJE_SEM_PIX,
                languageCode: "pt_BR",
                components: [
                    {
                        type: WabaComponentTypeEnum.BODY,
                        parameters: [
                            { type: WabaParameterTypeEnum.TEXT, text: respName },
                            { type: WabaParameterTypeEnum.TEXT, text: passName },
                            { type: WabaParameterTypeEnum.TEXT, text: valorStr }
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
                    type: WabaComponentTypeEnum.BODY,
                    parameters: [
                        { type: WabaParameterTypeEnum.TEXT, text: respName },
                        { type: WabaParameterTypeEnum.TEXT, text: passName },
                        { type: WabaParameterTypeEnum.TEXT, text: valorStr }
                    ]
                },
                pixButton
            ]
        };
    }

    static cobrancaAtrasado(ctx: Record<string, unknown>): WabaTemplatePayload {
        const respName = NotificationContextFormatter.getFirstName(ctx.nomeResponsavel as string, "Responsável");
        const passName = NotificationContextFormatter.getFirstName(ctx.nomePassageiro as string, "Passageiro");
        const valorStr = NotificationContextFormatter.formatRawValue(ctx.valor as number | string);
        const mesLabel = NotificationContextFormatter.getMonthLabel(ctx.mes as number | string);
        
        const pixButton = this.buildPixButtonComponent(ctx);

        if (!pixButton) {
            return {
                templateName: WabaTemplateNameEnum.PAIS_ATRASADO_SEM_PIX,
                languageCode: "pt_BR",
                components: [
                    {
                        type: WabaComponentTypeEnum.BODY,
                        parameters: [
                            { type: WabaParameterTypeEnum.TEXT, text: respName },
                            { type: WabaParameterTypeEnum.TEXT, text: passName },
                            { type: WabaParameterTypeEnum.TEXT, text: mesLabel },
                            { type: WabaParameterTypeEnum.TEXT, text: valorStr }
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
                    type: WabaComponentTypeEnum.BODY,
                    parameters: [
                        { type: WabaParameterTypeEnum.TEXT, text: respName },
                        { type: WabaParameterTypeEnum.TEXT, text: passName },
                        { type: WabaParameterTypeEnum.TEXT, text: mesLabel },
                        { type: WabaParameterTypeEnum.TEXT, text: valorStr }
                    ]
                },
                pixButton
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
                type: WabaComponentTypeEnum.HEADER,
                parameters: [
                    { type: WabaParameterTypeEnum.IMAGE, image: { link: reciboUrl } }
                ]
            });
        }

        components.push({
            type: WabaComponentTypeEnum.BODY,
            parameters: [
                { type: WabaParameterTypeEnum.TEXT, text: respName },
                { type: WabaParameterTypeEnum.TEXT, text: mesLabel },
                { type: WabaParameterTypeEnum.TEXT, text: passName },
                { type: WabaParameterTypeEnum.TEXT, text: valorStr }
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
                    type: WabaComponentTypeEnum.BODY,
                    parameters: [
                        { type: WabaParameterTypeEnum.TEXT, text: respName },
                        { type: WabaParameterTypeEnum.TEXT, text: passName }
                    ]
                },
                {
                    type: WabaComponentTypeEnum.BUTTON,
                    sub_type: WabaButtonSubTypeEnum.URL,
                    index: "0",
                    parameters: [
                        { type: WabaParameterTypeEnum.TEXT, text: tokenOrLink }
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
                    type: WabaComponentTypeEnum.BODY,
                    parameters: [
                        { type: WabaParameterTypeEnum.TEXT, text: driverName },
                        { type: WabaParameterTypeEnum.TEXT, text: valorStr },
                        { type: WabaParameterTypeEnum.TEXT, text: planoStr },
                        { type: WabaParameterTypeEnum.TEXT, text: dataStr }
                    ]
                },
                {
                    type: WabaComponentTypeEnum.BUTTON,
                    sub_type: WabaButtonSubTypeEnum.URL,
                    index: "0",
                    parameters: [
                        { type: WabaParameterTypeEnum.TEXT, text: tokenOrLink }
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
                    type: WabaComponentTypeEnum.BODY,
                    parameters: [
                        { type: WabaParameterTypeEnum.TEXT, text: driverName }
                    ]
                },
                {
                    type: WabaComponentTypeEnum.BUTTON,
                    sub_type: WabaButtonSubTypeEnum.URL,
                    index: "0",
                    parameters: [
                        { type: WabaParameterTypeEnum.TEXT, text: tokenOrLink }
                    ]
                }
            ]
        };
    }
}
