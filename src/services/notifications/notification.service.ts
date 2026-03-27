import { CompositeMessagePart } from "../../types/dtos/whatsapp.dto.js";

import {
    EVENTO_MOTORISTA_ASSINATURA_PAGO,
    EVENTO_MOTORISTA_ASSINATURA_VENCENDO,
    EVENTO_MOTORISTA_ASSINATURA_VENCEU,
    EVENTO_MOTORISTA_ASSINATURA_ATRASADA,
    EVENTO_MOTORISTA_TESTE_EXPIRANDO,
    EVENTO_MOTORISTA_TESTE_BOAS_VINDAS,
    EVENTO_MOTORISTA_TESTE_ENCERRADO,
    EVENTO_MOTORISTA_CONTRATO_ASSINADO,
    EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO,
    EVENTO_PASSAGEIRO_ASSINATURA_VENCEU,
    EVENTO_PASSAGEIRO_ATRASADO,
    EVENTO_PASSAGEIRO_CONTRATO_DISPONIVEL,
    EVENTO_PASSAGEIRO_CONTRATO_ASSINADO,
    EVENTO_AUTH_RECUPERACAO_SENHA,
    GLOBAL_WHATSAPP_INSTANCE
} from "../../config/constants.js";
import { DriverContext, DriverTemplates } from "./templates/driver.template.js";
import { PassengerContext, PassengerTemplates } from "./templates/passenger.template.js";
import { NotificationProviderAdapter } from "./ports/notification-provider.port.js";
import { EvolutionWhatsappQueueAdapter } from "./adapters/evolution.adapter.js";
import { MockSmsAdapter } from "./adapters/mock-sms.adapter.js";
import { MockEmailAdapter } from "./adapters/mock-email.adapter.js";

export type NotificationChannel = "WHATSAPP" | "SMS" | "EMAIL";

export interface NotificationOptions {
    channels?: NotificationChannel[];
    whatsapp?: {
        instanceName?: string;
    };
}

type PassengerEventType =
    | typeof EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO
    | typeof EVENTO_PASSAGEIRO_ASSINATURA_VENCEU
    | typeof EVENTO_PASSAGEIRO_ATRASADO
    | typeof EVENTO_PASSAGEIRO_CONTRATO_DISPONIVEL
    | typeof EVENTO_PASSAGEIRO_CONTRATO_ASSINADO;

type DriverEventType =
    | typeof EVENTO_MOTORISTA_TESTE_BOAS_VINDAS
    | typeof EVENTO_MOTORISTA_TESTE_EXPIRANDO
    | typeof EVENTO_MOTORISTA_TESTE_ENCERRADO
    | typeof EVENTO_MOTORISTA_ASSINATURA_VENCENDO
    | typeof EVENTO_MOTORISTA_ASSINATURA_VENCEU
    | typeof EVENTO_MOTORISTA_ASSINATURA_ATRASADA
    | typeof EVENTO_MOTORISTA_ASSINATURA_PAGO
    | typeof EVENTO_MOTORISTA_CONTRATO_ASSINADO
    | typeof EVENTO_AUTH_RECUPERACAO_SENHA;

class NotificationService {
    // Registro dos Adapters que farão o disparo real (ou envio para a fila)
    private adapters: Record<NotificationChannel, NotificationProviderAdapter>;

    constructor() {
        this.adapters = {
            "WHATSAPP": new EvolutionWhatsappQueueAdapter(),
            "SMS": new MockSmsAdapter(),
            "EMAIL": new MockEmailAdapter()
        };
    }

    /**
     * Envia notificação para Passageiro/Responsável
     * @param to Destinatário (Telefone para WA/SMS, Email para Email)
     */
    async notifyPassenger(
        to: string,
        type: PassengerEventType,
        ctx: PassengerContext & { reciboUrl?: string },
        options: NotificationOptions = {}
    ): Promise<boolean> {

        let parts: CompositeMessagePart[] = [];

        switch (type) {
            case EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO: parts = PassengerTemplates.dueSoon(ctx); break;
            case EVENTO_PASSAGEIRO_ASSINATURA_VENCEU: parts = PassengerTemplates.dueToday(ctx); break;
            case EVENTO_PASSAGEIRO_ATRASADO: parts = PassengerTemplates.overdue(ctx); break;
            case EVENTO_PASSAGEIRO_CONTRATO_DISPONIVEL: parts = PassengerTemplates.contractAvailable(ctx); break;
            case EVENTO_PASSAGEIRO_CONTRATO_ASSINADO: parts = PassengerTemplates.contractSignedBySelf(ctx); break;
        }

        return await this._processAndEnqueue(to, parts, type as string, options);
    }

    /**
     * Envia notificação para Motorista/Assinante
     * @param to Destinatário (Telefone para WA/SMS, Email para Email)
     */
    async notifyDriver(
        to: string,
        type: DriverEventType,
        ctx: DriverContext & { nomePagador?: string, nomePassageiro?: string, diasAtraso?: number, reciboUrl?: string, trialDays?: number },
        options: NotificationOptions = {}
    ): Promise<boolean> {

        let parts: CompositeMessagePart[] = [];

        switch (type) {
            case EVENTO_MOTORISTA_TESTE_BOAS_VINDAS: parts = DriverTemplates.welcomeTrial(ctx); break;
            case EVENTO_MOTORISTA_ASSINATURA_PAGO: parts = DriverTemplates.paymentConfirmed(ctx); break;
            case EVENTO_MOTORISTA_ASSINATURA_VENCEU: parts = DriverTemplates.dueToday(ctx); break;
            case EVENTO_MOTORISTA_ASSINATURA_VENCENDO: parts = DriverTemplates.dueSoon(ctx); break;
            case EVENTO_MOTORISTA_ASSINATURA_ATRASADA: parts = DriverTemplates.overdue(ctx); break;
            case EVENTO_MOTORISTA_TESTE_EXPIRANDO: parts = DriverTemplates.trialExpiring(ctx); break;
            case EVENTO_MOTORISTA_CONTRATO_ASSINADO: parts = DriverTemplates.contractSigned(ctx); break;
            case EVENTO_AUTH_RECUPERACAO_SENHA: parts = DriverTemplates.authRecovery(ctx); break;
            case EVENTO_MOTORISTA_TESTE_ENCERRADO: parts = []; break;
        }

        return await this._processAndEnqueue(to, parts, type as string, options);
    }

    /**
     * Central Dispatcher - Distribui a mensagem entre os canais selecionados delegando aos Adapters
     */
    private async _processAndEnqueue(
        to: string,
        parts: CompositeMessagePart[],
        eventType: string,
        options: NotificationOptions = {}
    ): Promise<boolean> {
        if (!parts || parts.length === 0) return false;

        const { channels = ["WHATSAPP"], whatsapp: whatsappOptions } = options;

        try {
            const results: Promise<boolean>[] = [];

            for (const channel of channels) {
                const adapter = this.adapters[channel];
                if (adapter) {
                    const providerOptions = {
                        eventType,
                        instanceName: channel === "WHATSAPP" ? (whatsappOptions?.instanceName || GLOBAL_WHATSAPP_INSTANCE) : undefined
                    };
                    results.push(adapter.sendComposite(to, parts, providerOptions));
                }
            }

            const statuses = await Promise.all(results);
            return statuses.some(s => s); // true se pelo menos um canal teve sucesso
        } catch (error) {
            return false;
        }
    }
}

export const notificationService = new NotificationService();
