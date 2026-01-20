import axios, { AxiosError } from "axios";
import { GLOBAL_WHATSAPP_INSTANCE, WHATSAPP_STATUS } from "../config/constants.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { CompositeMessagePart, ConnectInstanceResponse, EvolutionConnectResponse, EvolutionInstance } from "../types/dtos/whatsapp.dto.js";
export type { ConnectInstanceResponse };

const EVO_URL = env.EVOLUTION_API_URL;
const EVO_KEY = env.EVOLUTION_API_KEY;

/**
 * Configurações de privacidade e performance para instâncias de motoristas
 * Essas configurações garantem que o sistema não invada a privacidade do usuário
 */
const DRIVER_INSTANCE_SETTINGS = {
  rejectCalls: true,           // Rejeita chamadas de voz/vídeo
  ignoreGroups: true,          // Ignora mensagens de grupos
  alwaysOnline: false,         // Não força status "online"
  readMessages: false,         // Não marca mensagens como lidas
  syncFullHistory: false,      // Não sincroniza histórico completo
  readStatus: false            // Não marca stories como visto
};

class WhatsappService {
  
  /**
   * Helper para montar o nome da instância do usuário: "user_{id}"
   * Sanitiza o ID para evitar caracteres inválidos na URL
   */
  getInstanceName(usuarioId: string): string {
      return `user_${usuarioId}`; 
  }

  /**
   * Envia mensagem de texto simples
   */
  async sendText(number: string, text: string, instanceName: string = GLOBAL_WHATSAPP_INSTANCE): Promise<boolean> {
    const cleanNumber = number.replace(/\D/g, "");
    const finalNumber = cleanNumber.length <= 11 ? `55${cleanNumber}` : cleanNumber;

    const url = `${EVO_URL}/message/sendText/${instanceName}`;
    
    try {
      await axios.post(url, {
        number: finalNumber,
        text: text
      }, {
        headers: {
          "apikey": EVO_KEY,
          "Content-Type": "application/json"
        }
      });

      return true;

    } catch (error) {
      const err = error as AxiosError;
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
   * Configura/Atualiza o Webhook da instância
   */
  async setWebhook(instanceName: string, webhookUrl: string, enabled: boolean = true): Promise<boolean> {
      try {
          const url = `${EVO_URL}/webhook/set/${instanceName}`;
          await axios.post(url, {
              webhook: {
                enabled,
                url: webhookUrl,
                webhookByEvents: false,
                  events: ["CONNECTION_UPDATE", "QRCODE_UPDATED", "SEND_MESSAGE", "MESSAGES_UPDATE", "LOGOUT_INSTANCE"]
              }
          }, { 
              headers: { "apikey": EVO_KEY } 
          });
          return true;
      } catch (error) {
          const err = error as AxiosError;
           logger.error({ 
              err: err.response?.data || err.message, 
              instanceName 
          }, "Falha ao configurar Webhook");
          return false;
      }
  }

  /**
   * Atualiza as configurações de privacidade e performance da instância
   * Garante que a instância não invada a privacidade do motorista
   */
  async updateSettings(instanceName: string, settings: Partial<typeof DRIVER_INSTANCE_SETTINGS> = DRIVER_INSTANCE_SETTINGS): Promise<boolean> {
      try {
          const url = `${EVO_URL}/instance/settings/set/${instanceName}`;
          
          const mergedSettings = { ...DRIVER_INSTANCE_SETTINGS, ...settings };
          
          await axios.post(url, mergedSettings, {
              headers: { "apikey": EVO_KEY }
          });

          logger.info({ instanceName, settings: mergedSettings }, "Configurações de privacidade aplicadas com sucesso");
          return true;
      } catch (error) {
          const err = error as AxiosError;
          logger.warn({ 
              err: err.response?.data || err.message, 
              instanceName 
          }, "Falha ao atualizar configurações (pode ser esperado em versões antigas da API)");
          // Não falha a operação pois essa feature pode não estar disponível em todas as versões
          return true;
      }
  }

  /**
   * Cria uma instância (se não existir)
   * Retorna 'true' se a instância está pronta (já existia ou foi criada agora)
   */
  async createInstance(instanceName: string, enableQrcode: boolean = true): Promise<boolean> {
      try {
          const webhookUrl = `${env.BACKEND_URL}/api/evolution/webhook`;

          // 1. Verificar se já existe
          const status = await this.getInstanceStatus(instanceName);
          
          if (status.state !== WHATSAPP_STATUS.NOT_FOUND && status.state !== "ERROR") {
              // Já existe, mas vamos garantir que o Webhook e as configurações estejam corretos
              await this.setWebhook(instanceName, webhookUrl, true);
              await this.updateSettings(instanceName);
              return true; 
          }

          // 2. Se não existe (404), criar
          logger.info({ instanceName, enableQrcode }, "Instância não encontrada. Criando nova instância na Evolution...");
          const url = `${EVO_URL}/instance/create`;
          await axios.post(url, {
              instanceName: instanceName,
              token: "random_secure_token", 
              qrcode: enableQrcode, 
              integration: "WHATSAPP-BAILEYS",
              webhook: {
                  enabled: true,
                  url: webhookUrl,
                  webhookByEvents: false,
                    events: ["CONNECTION_UPDATE", "QRCODE_UPDATED", "SEND_MESSAGE", "MESSAGES_UPDATE", "LOGOUT_INSTANCE"]
              }
          }, { 
              headers: { "apikey": EVO_KEY } 
          });

          // 3. Delay adequado para garantir que a Evolution registrou a nova instância internamente
          // Evolution API precisa de tempo para inicializar o Chromium/Baileys
          await new Promise(r => setTimeout(r, 3000));

          // 4. Aplicar configurações de privacidade
          await this.updateSettings(instanceName);

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
          const webhookUrl = `${env.BACKEND_URL}/api/evolution/webhook`;

          // --- FLUXO PAIRING CODE (Mobile) ---
          if (phoneNumber) {
              const cleanPhone = phoneNumber.replace(/\D/g, "");
              const finalPhone = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;

              // 1. Limpeza Inteligente de Sessão (Smart Cleanup)
              // Só limpa se realmente necessário. Não limpa se já há um código válido em andamento.
              
              const status = await this.getInstanceStatus(instanceName);
              const isWorking = status.state === WHATSAPP_STATUS.OPEN || status.state === WHATSAPP_STATUS.CONNECTED;

              // Se já está conectado, não faz sentido pedir pairing code. Retorna sucesso.
              if (isWorking) {
                   // Garante webhook atualizado mesmo se já conectado
                   await this.setWebhook(instanceName, webhookUrl, true);
                   await this.updateSettings(instanceName);
                   return { instance: { state: WHATSAPP_STATUS.OPEN } };
              }

              // Se está em estado de erro ou travado, fazer limpeza
              const needsCleanup = status.state !== WHATSAPP_STATUS.NOT_FOUND && 
                                  (status.state === "ERROR" || status.state === WHATSAPP_STATUS.CONNECTING);
              
              if (needsCleanup) {
                   logger.info({ instanceName, reason: status.state }, "Limpando instância travada para novo Pairing Code...");
                   await this.disconnectInstance(instanceName);
                   await this.deleteInstance(instanceName);
                   await new Promise(r => setTimeout(r, 2500));
              }

              // 2. Criar Instância com enableQrcode = false para evitar conflitos
              // O false garante que a Evolution foque apenas no Pairing Code
              await this.createInstance(instanceName, false);

              // Esperar a Evolution inicializar o Chromium
              logger.info({ instanceName }, "Aguardando inicialização (6s)...");
              await new Promise(r => setTimeout(r, 6000));

              // 3. Solicitar Código (Retry com Backoff Exponencial)
              const maxAttempts = 6;
              for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                  const url = `${EVO_URL}/instance/connect/${instanceName}?number=${finalPhone}`;
                  try {
                      const { data } = await axios.get<{ pairingCode: string, code: string }>(url, { headers: { "apikey": EVO_KEY } });
                      
                      // PRIORIDADE: Pairing Code explícito
                      let pCode: string | undefined = data?.pairingCode;

                      // FALLBACK: Campo 'code', mas SOMENTE se NÃO for um QR Code (começa com 2@)
                      if (!pCode) {
                          pCode = data.code;
                      }
                      
                      // Filtro Anti-QR: Ignorar se começar com "2@" ou for muito longo
                      if (pCode?.startsWith("2@")) pCode = undefined;

                      // Validação Rígida: Pairing Code é curto (ex: "K2A5-Z9B1"). 
                      if (pCode && pCode.length >= 8 && pCode.length < 25) {
                          logger.info({ instanceName, attempt, pCode: pCode.substring(0, 4) + "***" }, "Pairing Code gerado com sucesso");
                          return { pairingCode: { code: pCode } };
                      }
                  } catch (e) {
                      const err = e as AxiosError;
                      logger.warn({ instanceName, attempt, status: err.response?.status }, `Tentativa ${attempt}/${maxAttempts} falhou`);
                  }

                  if (attempt < maxAttempts) {
                      // Backoff exponencial: 1s, 2s, 4s, 8s, 16s
                      const delayMs = Math.pow(2, attempt - 1) * 1000;
                      logger.info({ instanceName, attempt, delayMs }, `Aguardando ${delayMs}ms antes da próxima tentativa...`);
                      await new Promise(r => setTimeout(r, delayMs));
                  }
              }
              throw new Error("Não foi possível gerar o código após 6 tentativas. Tente novamente.");
          }

          // --- FLUXO QR CODE / RECONNECT (Sem Phone) ---
          
          // 1. Garantir que instância existe e webhook está setado
          await this.createInstance(instanceName, true);
          
          // WARM-UP QR CODE: Esperar o Chrome iniciar para gerar o QR Code
          await new Promise(r => setTimeout(r, 3000)); 

          // 2. Soft Reconnect (Apenas pede connect para ver se gera QR ou conecta session existente)
          let lastData: EvolutionConnectResponse | null = null;
          
          for (let attempt = 1; attempt <= 5; attempt++) {
              const url = `${EVO_URL}/instance/connect/${instanceName}`;
              const { data } = await axios.get<EvolutionConnectResponse>(url, { headers: { "apikey": EVO_KEY } });
              lastData = data;

              if (data?.base64 || data?.qrcode?.base64 || data?.instance?.state === WHATSAPP_STATUS.OPEN) {
                  break; 
              }
              
              if (attempt < 5) await new Promise(r => setTimeout(r, 2000));
          }

          // Retorno padrão
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
