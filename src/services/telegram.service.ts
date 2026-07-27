import { logger } from "../config/logger.js";
import axios from "axios";

export const telegramService = {
  async sendMessage(message: string): Promise<boolean> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

    if (!token || !chatId) {
      logger.warn("[TelegramService] TELEGRAM_BOT_TOKEN ou TELEGRAM_ADMIN_CHAT_ID ausentes no .env");
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      await axios.post(url, {
        chat_id: chatId,
        text: message,
        parse_mode: "HTML"
      });
      return true;
    } catch (error: any) {
      const errMsg = error.response?.data?.description || error.message;
      logger.error({ error: errMsg }, "[TelegramService] Falha ao enviar mensagem");
      throw new Error(errMsg);
    }
  }
};
