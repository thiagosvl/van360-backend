import axios from "axios";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

const EVO_URL = env.EVOLUTION_API_URL;
const EVO_KEY = env.EVOLUTION_API_KEY;
const INSTANCE_NAME = "Van360"; // Nome da instância no Evolution

// Interface para resposta da API (simplificada)
interface EvolutionResponse {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  message: any;
}

class WhatsappService {
  
  /**
   * Envia mensagem de texto simples
   */
  async sendText(number: string, text: string): Promise<boolean> {
    // Formata número (apenas dígitos)
    const cleanNumber = number.replace(/\D/g, "");
    
    // Adiciona 55 se não tiver (assumindo BR)
    const finalNumber = cleanNumber.length <= 11 ? `55${cleanNumber}` : cleanNumber;

    const url = `${EVO_URL}/message/sendText/${INSTANCE_NAME}`;
    
    try {
      logger.info({ number: finalNumber }, "Enviando mensagem WhatsApp...");

      const { data } = await axios.post(url, {
        number: finalNumber,
        text: text
      }, {
        headers: {
          "apikey": EVO_KEY,
          "Content-Type": "application/json"
        }
      });

      logger.info({ messageId: data?.key?.id }, "Mensagem WhatsApp enviada com sucesso.");
      return true;

    } catch (error: any) {
      logger.error({ 
        error: error.response?.data || error.message,
        number: finalNumber 
      }, "Falha ao enviar mensagem WhatsApp");
      return false; // Não quebra o fluxo, apenas loga erro
    }
  }

  /**
   * Envia Imagem (Base64)
   */
  async sendImage(number: string, base64: string, caption?: string): Promise<boolean> {
    const cleanNumber = number.replace(/\D/g, "");
    const finalNumber = cleanNumber.length <= 11 ? `55${cleanNumber}` : cleanNumber;
    const url = `${EVO_URL}/message/sendMedia/${INSTANCE_NAME}`;

    try {
      logger.info({ number: finalNumber }, "Enviando Imagem WhatsApp...");

      const { data } = await axios.post(url, {
        number: finalNumber,
        media: base64,       // Base64 puro
        mediatype: "image",
        caption: caption || ""
      }, {
        headers: {
          "apikey": EVO_KEY,
          "Content-Type": "application/json"
        }
      });

      logger.info({ messageId: data?.key?.id }, "Imagem WhatsApp enviada com sucesso.");
      return true;
    } catch (error: any) {
      logger.error({ 
        error: error.response?.data || error.message,
        number: finalNumber 
      }, "Falha ao enviar Imagem WhatsApp");
      return false;
    }
  }

  /**
   * Verifica se a instância está conectada
   */
  async checkInstanceStatus(): Promise<string> {
    try {
      const url = `${EVO_URL}/instance/connectionState/${INSTANCE_NAME}`;
      const { data } = await axios.get(url, {
        headers: { "apikey": EVO_KEY }
      });
      return data?.instance?.state || "UNKNOWN";
    } catch (error) {
      return "ERROR";
    }
  }
}

export const whatsappService = new WhatsappService();
