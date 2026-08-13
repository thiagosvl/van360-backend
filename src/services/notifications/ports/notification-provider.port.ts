import { NotificationOptions } from "../notification.service.js";

export interface NotificationSendResult {
    success: boolean;
    providerMessageId?: string;
    error?: string;
}

export interface NotificationProviderPort {
    send(eventName: string, contextData: Record<string, unknown>, options?: NotificationOptions): Promise<NotificationSendResult>;
}

