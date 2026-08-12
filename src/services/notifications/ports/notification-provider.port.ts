import { NotificationOptions } from "../notification.service.js";

export interface NotificationProviderPort {
    send(eventName: string, contextData: Record<string, unknown>, options?: NotificationOptions): Promise<boolean>;
}
