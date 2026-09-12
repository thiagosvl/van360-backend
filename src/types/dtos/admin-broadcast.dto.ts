import { PushNotificationAction } from "../enums.js";

export interface AdminBroadcastEstimateResponseDTO {
  totalMotoristas: number;
  comPushToken: number;
  semPushToken: number;
  detalhesPorStatus: Record<string, number>;
}

export interface AdminBroadcastSendResponseDTO {
  totalDestinatarios: number;
  totalEnviados: number;
  totalFalhas: number;
}

export interface AdminBroadcastSendPayload {
  status: string[];
  titulo: string;
  mensagem: string;
  action?: PushNotificationAction;
}
