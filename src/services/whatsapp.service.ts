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
   * Retorna 'true' se a instância está pronta (já existia ou foi criada agora)
   */
  async createInstance(instanceName: string): Promise<boolean> {
      try {
          // 1. Verificar se já existe
          const status = await this.getInstanceStatus(instanceName);
          
          if (status.state !== WHATSAPP_STATUS.NOT_FOUND && status.state !== "ERROR") {
              return true; // Já existe e está respondendo
          }

          // 2. Se não existe (404), criar
          logger.info({ instanceName }, "Instância não encontrada. Criando nova instância na Evolution...");
          const url = `${EVO_URL}/instance/create`;
          await axios.post(url, {
              instanceName: instanceName,
              qrcode: true, 
              integration: "WHATSAPP-BAILEYS" 
          }, { 
              headers: { "apikey": EVO_KEY } 
          });

          // 3. Pequeno delay para garantir que a Evolution registrou a nova instância internamente
          await new Promise(r => setTimeout(r, 1200));
          return true;
      } catch (error) {
          const err = error as AxiosError;
          logger.error({ 
              err: err.response?.data || err.message, 
              instanceName 
          }, "Falha crítica ao criar/verificar instância na Evolution");
          return false;
      }
  }

  /**
   * Solicita conexão (Retorna QR Code ou Pairing Code)
   * Se a instância não existir, cria.
   */
  async connectInstance(instanceName: string, phoneNumber?: string, alreadyRetried: boolean = false): Promise<ConnectInstanceResponse> {
      try {
          // --- FLUXO PAIRING CODE (Mobile) ---
          if (phoneNumber) {
              const cleanPhone = phoneNumber.replace(/\D/g, "");
              const finalPhone = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;

              // 1. Limpeza Agressiva de Sessão Zumbi
              // Se vamos pedir um código novo, a sessão anterior NÃO presta.
              // Verificar se está 'connecting' ou 'open' e matar.
              const status = await this.getInstanceStatus(instanceName);
              if (status.state !== WHATSAPP_STATUS.NOT_FOUND && status.state !== "close") {
                   logger.warn({ instanceName, state: status.state }, "Limpando sessão antiga para gerar novo Pairing Code...");
                   await this.disconnectInstance(instanceName);
                   await new Promise(r => setTimeout(r, 2500)); // Tempo vital para a Evolution limpar
              }

              // 2. Garantir Instância Criada
              await this.createInstance(instanceName);

              // 3. Solicitar Código com Retries (Paciência)
              for (let attempt = 1; attempt <= 4; attempt++) {
                  // FIXED: O endpoint correto é o mesmo do QR Code, apenas passando o numero
                  const url = `${EVO_URL}/instance/connect/${instanceName}?number=${finalPhone}`;
                  
                  try {
                      const { data } = await axios.get<{ pairingCode: string, code: string }>(url, { headers: { "apikey": EVO_KEY } });
                      
                      const pCode = data?.pairingCode || data?.code; // Evolution as vezes retorna em campos diferentes
                      
                      // Validação: Pairing Code deve ser curto (ex: 8 chars). Se for longo, é QR Code vazando.
                      if (pCode && pCode.length < 20) {
                          // Sucesso!
                          return { pairingCode: { code: pCode } };
                      } else {
                          logger.warn({ instanceName, attempt, data }, "Resposta inválida da Evolution: 'pairingCode' ausente ou muito longo (possível QR Code).");
                      }
                  } catch (e) {
                       const err = e as AxiosError;
                       logger.warn({ 
                           instanceName, 
                           attempt, 
                           status: err.response?.status,
                           data: err.response?.data,
                           message: err.message
                       }, "Erro ao solicitar Pairing Code na Evolution.");
                  }

                  if (attempt < 4) {
                      const delay = 3000;
                      logger.warn({ instanceName, attempt }, `Retry Pairing Code em ${delay}ms...`);
                      await new Promise(r => setTimeout(r, delay));
                  }
              }
              
              throw new Error("Não foi possível gerar o código. A API não respondeu a tempo.");
          }

          // --- FLUXO QR CODE (Legacy/Desktop) ---
          
          // 1. Garantir que instância existe
          const created = await this.createInstance(instanceName);
          if (!created) throw new Error("A instância do WhatsApp não pôde ser preparada.");

          // 2. Loop de tentativa para QR Code
          let lastData: EvolutionConnectResponse | null = null;
          
          for (let attempt = 1; attempt <= 3; attempt++) {
              const url = `${EVO_URL}/instance/connect/${instanceName}`;
              const { data } = await axios.get<EvolutionConnectResponse>(url, { headers: { "apikey": EVO_KEY } });
              lastData = data;

              if (data?.base64 || data?.qrcode?.base64 || data?.instance?.state === WHATSAPP_STATUS.OPEN) {
                  break; 
              }
              
              if (attempt < 3) {
                  logger.warn({ instanceName, attempt }, "Aguardando QR Code...");
                  await new Promise(r => setTimeout(r, 1500));
              }
          }

          // 3. Processar resultado QR
          if (lastData?.base64 || lastData?.qrcode?.base64) {
               return { 
                   qrcode: { 
                       base64: (lastData.base64 || lastData.qrcode?.base64) as string,
                       code: lastData.code || lastData.qrcode?.code
                   } 
               };
          }
           
          if (lastData?.instance?.state === WHATSAPP_STATUS.OPEN) {
              return { instance: { state: WHATSAPP_STATUS.OPEN } };
          }

          // Tratar travamento "connecting" no fluxo QR
          if ((lastData?.instance?.state === "connecting" || lastData?.instance?.state === WHATSAPP_STATUS.CONNECTING) && !alreadyRetried) {
                logger.warn({ instanceName }, "QR Code: Instância travada em 'connecting'. Reiniciando...");
                await this.disconnectInstance(instanceName);
                await new Promise(r => setTimeout(r, 2000));
                return this.connectInstance(instanceName, undefined, true);
          }
            
          return {}; 

      } catch (error) {
          const err = error as AxiosError;
          logger.error({ err: err.response?.data || err.message, instanceName }, "Falha ao conectar instância");
          throw new Error("Falha ao gerar conexão, tente novamente.");
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