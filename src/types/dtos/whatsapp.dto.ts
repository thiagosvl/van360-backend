export interface EvolutionInstance {
  state: string;
  status?: string;
  statusReason?: number;
}

export interface EvolutionResponse {
    key?: {
      remoteJid: string;
      fromMe: boolean;
      id: string;
    };
    message?: unknown;
}

export interface EvolutionQrCode {
    base64: string;
    code?: string;
}

export interface EvolutionConnectResponse {
    qrcode?: EvolutionQrCode;
    instance?: EvolutionInstance;
    base64?: string; // Legacy/Alternative format
    code?: string; // Legacy/Alternative format
    pairingCode?: string; // New Mobile Connection
}

export interface CompositeMessagePart {
  type: "text" | "image";
  content?: string;  // Para texto ou legenda
  mediaBase64?: string; // Para imagem
  delayMs?: number; // Delay opcional antes de enviar
  meta?: string; // Flag interna (ex: "qrcode")
}

export interface EvolutionPairingCode {
    code: string;
}

export interface ConnectInstanceResponse {
    qrcode?: EvolutionQrCode;
    pairingCode?: EvolutionPairingCode;
    instance?: EvolutionInstance;
}
