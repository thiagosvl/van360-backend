import axios, { AxiosError } from "axios";
import { GLOBAL_WHATSAPP_INSTANCE, WHATSAPP_STATUS } from "../config/constants.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { CompositeMessagePart, ConnectInstanceResponse, EvolutionConnectResponse, EvolutionInstance } from "../types/dtos/whatsapp.dto.js";
export type { ConnectInstanceResponse };

const EVO_URL = env.EVOLUTION_API_URL;
const EVO_KEY = env.EVOLUTION_API_KEY;

class WhatsappService {
  
  /**
   * Helper para montar o nome da instância do usuário: "user_{id}"
   * Sanitiza o ID para evitar caracteres inválidos na URL
   */
  getInstanceName(usuarioId: string): string {
      // Remover hífens ou caracteres especiais se a API não aceitar
      // A Evolution aceita alfanuméricos. UUID tem hifens. Vamos simplificar se precisar.
      // Por enquanto, manter UUID deve funcionar.
      return `user_${usuarioId}`; 
  }

  /**
   * Envia mensagem de texto simples
   */
  async sendText(number: string, text: string, instanceName: string = GLOBAL_WHATSAPP_INSTANCE): Promise<boolean> {
    // Formata número (apenas dígitos)
    const cleanNumber = number.replace(/\D/g, "");
    const finalNumber = cleanNumber.length <= 11 ? `55${cleanNumber}` : cleanNumber;

    const url = `${EVO_URL}/message/sendText/${instanceName}`;
    
    try {
      // logger.info({ number: finalNumber, instance: instanceName }, "Enviando mensagem WhatsApp...");

      await axios.post(url, {
        number: finalNumber,
        text: text
      }, {
        headers: {
          "apikey": EVO_KEY,
          "Content-Type": "application/json"
        }
      });

      // logger.info({ messageId: data?.key?.id, instance: instanceName }, "Mensagem WhatsApp enviada.");
      return true;

    } catch (error) {
      const err = error as AxiosError;
    //   logger.error({ 
    //     error: err.response?.data || err.message,
    //     number: finalNumber,
    //     instance: instanceName
    //   }, "Falha ao enviar mensagem WhatsApp");
      return false; 
    }
  }

  /**
   * Envia Imagem (Base64)
   */
  async sendImage(number: string, media: string, caption?: string, instanceName: string = GLOBAL_WHATSAPP_INSTANCE): Promise<boolean> {
    const cleanNumber = number.replace(/\D/g, "");
    const finalNumber = cleanNumber.length <= 11 ? `55${cleanNumber}` : cleanNumber;
    const url = `${EVO_URL}/message/sendMedia/${instanceName}`;

    try {
      
      const body: { number: string; media: string; mediatype: string; caption: string; fileName?: string } = {
        number: finalNumber,
        media: media,
        mediatype: "image",
        caption: caption || ""
      };

      if (!media.startsWith('http')) {
        body.media = media.replace(/^data:image\/[a-z]+;base64,/, "");
        body.fileName = "image.png"; 
      }

      await axios.post(url, body, {
        headers: {
          "apikey": EVO_KEY,
          "Content-Type": "application/json"
        }
      });

      return true;
    } catch (error) {
      const err = error as AxiosError;
      logger.error({ 
         error: err.response?.data || err.message,
         status: err.response?.status,
         number: finalNumber,
         instance: instanceName
      }, "Falha ao enviar Imagem WhatsApp");
      return false;
    }
  }

  /**
   * Envia Mensagem Composta (Lego)
   */
  async sendCompositeMessage(number: string, parts: CompositeMessagePart[], instanceName: string = GLOBAL_WHATSAPP_INSTANCE): Promise<boolean> {
    const cleanNumber = number.replace(/\D/g, "");
    const finalNumber = cleanNumber.length <= 11 ? `55${cleanNumber}` : cleanNumber;

    // logger.info({ number: finalNumber, partsCount: parts.length, instance: instanceName }, "Enviando Mensagem Composta");

    let success = true;

    for (const part of parts) {
      if (part.delayMs) {
        await new Promise(resolve => setTimeout(resolve, part.delayMs));
      }

      if (part.type === "text" && part.content) {
         const sent = await this.sendText(finalNumber, part.content, instanceName);
         if (!sent) success = false;
      } 
      else if (part.type === "image" && part.mediaBase64) {
         const sent = await this.sendImage(finalNumber, part.mediaBase64, part.content, instanceName);
         if (!sent) success = false;
      }
    }
    return success;
  }

  // --- GESTÃO DE INSTÂNCIAS ---

  /**
   * Verifica status da instância
   */
  async getInstanceStatus(instanceName: string): Promise<{ state: string; statusReason?: number }> {
    try {
      const url = `${EVO_URL}/instance/connectionState/${instanceName}`;
      const { data } = await axios.get<{ instance: EvolutionInstance }>(url, { headers: { "apikey": EVO_KEY } });
      
      // Evolution retorna { instance: { state: "open", ... } }
      return { 
          state: data?.instance?.state || WHATSAPP_STATUS.UNKNOWN,
          statusReason: data?.instance?.statusReason 
      };
    } catch (error) {
      const err = error as AxiosError;
      if (err.response?.status === 404) {
          return { state: WHATSAPP_STATUS.NOT_FOUND };
      }
      return { state: "ERROR" };
    }
  }

  /**
   * Cria uma instância (se não existir)
   */
  async createInstance(instanceName: string): Promise<boolean> {
      try {
          // Verificar se já existe primeiro
          const status = await this.getInstanceStatus(instanceName);
          if (status.state !== WHATSAPP_STATUS.NOT_FOUND) {
              return true; // Já existe
          }

          const url = `${EVO_URL}/instance/create`;
          await axios.post(url, {
              instanceName: instanceName,
              qrcode: true, // Habilita retorno de QR no connect
              integration: "WHATSAPP-BAILEYS" 
          }, { 
              headers: { "apikey": EVO_KEY } 
          });

          return true;
      } catch (error) {
          const err = error as AxiosError;
          logger.error({ err: err.response?.data || err.message, instanceName }, "Falha ao criar instância Evolution");
          return false;
      }
  }

  /**
   * Solicita conexão (Retorna QR Code)
   * Se a instância não existir, cria.
   */
  async connectInstance(instanceName: string): Promise<ConnectInstanceResponse> {
      try {
          // 1. Garantir que instância existe
          await this.createInstance(instanceName);

          // 2. Chamar /instance/connect/{instance}
          const url = `${EVO_URL}/instance/connect/${instanceName}`;
          const { data } = await axios.get<EvolutionConnectResponse>(url, { headers: { "apikey": EVO_KEY } });

          // Retorno esperado Evolution V2: { base64: "...", code: "..." } ou { instance: { state: "open" } } se já conectado
          if (data?.base64 || data?.qrcode?.base64) {
               return { 
                   qrcode: { 
                       base64: (data.base64 || data.qrcode?.base64) as string,
                       code: data.code || data.qrcode?.code
                   } 
               };
          }
           
          // Se já estiver conectado, pode não retornar QR
          if (data?.instance?.state === WHATSAPP_STATUS.OPEN) {
              return { instance: { state: WHATSAPP_STATUS.OPEN } };
          }
            // Se estiver "connecting" mas sem QR Code, pode estar travado.
            // Vamos tentar um logout forçado e conectar novamente.
            if (data?.instance?.state === "connecting" || data?.instance?.state === WHATSAPP_STATUS.CONNECTING) {
                logger.warn({ instanceName }, "Instância travada em 'connecting'. Forçando logout para novo QR Code...");
                await this.disconnectInstance(instanceName);
                
                // Tenta conectar de novo após breve delay
                await new Promise(r => setTimeout(r, 1000));
                const retryUrl = `${EVO_URL}/instance/connect/${instanceName}`;
                const { data: retryData } = await axios.get<EvolutionConnectResponse>(retryUrl, { headers: { "apikey": EVO_KEY } });
                
                if (retryData?.base64 || retryData?.qrcode?.base64) {
                    return { 
                        qrcode: { 
                            base64: (retryData.base64 || retryData.qrcode?.base64) as string,
                            code: retryData.code || retryData.qrcode?.code
                        } 
                    };
                }
            }
            
            return {}; // Retorna vazio se falhar algo
        } catch (error) {
            const err = error as AxiosError;
            logger.error({ err: err.response?.data || err.message, instanceName }, "Falha ao conectar instância");
            throw new Error("Falha ao gerar QR Code de conexão.");
        }
  }

  /**
   * Solicita Código de Pareamento (Mobile)
   */
  async requestPairingCode(instanceName: string, phoneNumber: string): Promise<ConnectInstanceResponse> {
      try {
          // 1. Garantir que instância existe
          await this.createInstance(instanceName);

          const cleanNumber = phoneNumber.replace(/\D/g, "");
          // Evolution geralmente espera o número no formato internacional (55...)
          const finalNumber = cleanNumber.length <= 11 ? `55${cleanNumber}` : cleanNumber;

          // 2. Chamar /instance/connect/{instance} com o query param 'number'
          // Evolution V2: Ao passar ?number=..., ele retorna o pairingCode ao invés do QR
          const url = `${EVO_URL}/instance/connect/${instanceName}?number=${finalNumber}`;
          
          const { data } = await axios.get<EvolutionConnectResponse>(url, { headers: { "apikey": EVO_KEY } });

          if (data?.pairingCode) {
              // Se o pairingCode for muito longo, provavelmente é um QR Payload (vaza as vezes na Evo)
              if (data.pairingCode.length > 20) {
                  logger.warn({ instanceName, pairingCodeLength: data.pairingCode.length }, "Evolution returned a QR payload instead of Pairing Code");
                  return {};
              }
              return { pairingCode: data.pairingCode };
          }

          logger.warn({ instanceName, data }, "Evolution did not return pairingCode");
          return {};

      } catch (error) {
          const err = error as AxiosError;
          logger.error({ err: err.response?.data || err.message, instanceName }, "Falha ao solicitar Pairing Code");
          throw new Error("Falha ao gerar Código de Pareamento.");
      }
  }

  /**
   * Desconecta (Logout)
   */
  async disconnectInstance(instanceName: string): Promise<boolean> {
      try {
          const url = `${EVO_URL}/instance/logout/${instanceName}`;
          await axios.delete(url, { headers: { "apikey": EVO_KEY } });
          return true;
      } catch (err) {
          return false;
      }
  }
  
  /**
   * Deleta a instância
   */
  async deleteInstance(instanceName: string): Promise<boolean> {
      try {
          const url = `${EVO_URL}/instance/delete/${instanceName}`;
          await axios.delete(url, { headers: { "apikey": EVO_KEY } });
          return true;
      } catch (err) {
          return false; // Pode já não existir
      }
  }
}

export const whatsappService = new WhatsappService();
