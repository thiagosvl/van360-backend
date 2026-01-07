
import axios from "axios";
import { logger } from "../config/logger.js";

// Configuração fixa para o ambiente local/docker criado
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || "http://localhost:8081";
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || "B6D711FCDE4D4FD5936544120E713976";
const INSTANCE_NAME = "van360-main";

export const whatsappService = {
  /**
   * Verifica se a instância está conectada
   */
  async checkConnection(): Promise<boolean> {
    try {
      const url = `${EVOLUTION_API_URL}/instance/connectionState/${INSTANCE_NAME}`;
      const { data } = await axios.get(url, {
        headers: { apikey: EVOLUTION_API_KEY }
      });
      return data?.instance?.state === "open";
    } catch (error) {
      logger.error({ error }, "Falha ao verificar conexão com WhatsApp");
      return false;
    }
  },

  /**
   * Envia mensagem de texto simples
   */
  async sendText(phone: string, message: string): Promise<any> {
    try {
      const url = `${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`;
      const body = {
        number: phone,
        options: {
          delay: 1200,
          presence: "composing",
        },
        textMessage: {
          text: message
        }
      };

      const { data } = await axios.post(url, body, {
        headers: { 
            apikey: EVOLUTION_API_KEY,
            "Content-Type": "application/json"
        }
      });
      
      logger.info({ phone }, "Mensagem WhatsApp enviada com sucesso");
      return data;
    } catch (error: any) {
      logger.error({ error: error.response?.data || error.message, phone }, "Erro ao enviar mensagem WhatsApp");
      throw new Error("Falha no envio de WhatsApp");
    }
  }
};
