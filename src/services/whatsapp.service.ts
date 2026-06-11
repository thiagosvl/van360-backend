import axios, { AxiosError } from "axios";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import {
    EvolutionConnectResponse,
    ConnectInstanceResponse,
    EvolutionInstance,
    CompositeMessagePart,
    EvolutionInstanceFallback
} from "../types/dtos/whatsapp.dto.js";
import { EvolutionEvent, EvolutionIntegration, WhatsappMediaType, WhatsappStatus } from "../types/enums.js";
import { formatWhatsAppNumber } from "../utils/string.utils.js";

const EVO_URL = env.EVOLUTION_API_URL;
const EVO_KEY = env.EVOLUTION_API_KEY;
const EVO_HEADERS = { "apikey": EVO_KEY };
const WEBHOOK_URL = `${env.BACKEND_URL}/api/evolution/webhook`;

export class WhatsappService {
    async getInstanceStatus(instanceName: string): Promise<EvolutionInstance> {
        try {
            const url = `${EVO_URL}/instance/connectionState/${instanceName}`;
            const { data } = await axios.get(url, { headers: EVO_HEADERS });

            const rawState = data?.instance?.state || data?.state;
            
            return {
                state: (rawState as WhatsappStatus) || WhatsappStatus.UNKNOWN,
                status: data?.instance?.status || data?.status,
                statusReason: data?.instance?.statusReason || data?.statusReason
            };
        } catch (error) {
            const err = error as AxiosError;
            
            try {
                const fallbackUrl = `${EVO_URL}/instance/fetchInstances?instanceName=${instanceName}`;
                const { data } = await axios.get(fallbackUrl, { headers: EVO_HEADERS });
                const instances = Array.isArray(data) ? data : (data?.instances || [data?.instance]);
                const instance = instances.find((i: EvolutionInstanceFallback) => (i?.instanceName || i?.name) === instanceName);

                if (instance) {
                    return {
                        state: (instance.state || instance.status) as WhatsappStatus,
                        status: instance.status
                    };
                }
            } catch (fallbackErr) {
                const errFallback = fallbackErr as AxiosError;
                logger.warn({ err: errFallback.message, instanceName }, "[WhatsappService] Fallback status falhou");
            }

            if (err.response?.status === 404) {
                return { state: WhatsappStatus.NOT_FOUND };
            }
            
            logger.error({ err: err.message, instanceName }, "[WhatsappService] Erro ao consultar status");
            return { state: WhatsappStatus.UNKNOWN };
        }
    }

    async sendText(number: string, text: string, instanceName: string): Promise<boolean> {
        try {
            const finalNumber = formatWhatsAppNumber(number);

            const url = `${EVO_URL}/message/sendText/${instanceName}`;
            await axios.post(url, {
                number: finalNumber,
                text: text,
                delay: 1200,
                linkPreview: true
            }, { headers: EVO_HEADERS });

            return true;
        } catch (error) {
            const err = error as AxiosError;
            logger.error({ err: err.response?.data || err.message, instanceName }, "[WhatsappService] Erro ao enviar texto");
            return false;
        }
    }

    async sendImage(number: string, media: string, caption: string, instanceName: string): Promise<boolean> {
        try {
            const finalNumber = formatWhatsAppNumber(number);

            const url = `${EVO_URL}/message/sendMedia/${instanceName}`;
            const cleanBase64 = media.includes('base64,') ? media.split('base64,')[1] : media;

            const body = {
                number: finalNumber,
                media: cleanBase64,
                mediatype: WhatsappMediaType.IMAGE,
                caption: caption || ""
            };

            await axios.post(url, body, { headers: EVO_HEADERS });
            return true;
        } catch (error) {
            const err = error as AxiosError;
            logger.error({ err: err.response?.data || err.message, instanceName }, "[WhatsappService] Erro ao enviar imagem");
            return false;
        }
    }

    async sendCompositeMessage(number: string, parts: CompositeMessagePart[], instanceName: string): Promise<boolean> {
        const finalNumber = formatWhatsAppNumber(number);
        let success = true;

        for (const part of parts) {
            if (part.delayMs) {
                await new Promise(resolve => setTimeout(resolve, part.delayMs));
            }

            if (part.type === WhatsappMediaType.TEXT && part.content) {
                const sent = await this.sendText(finalNumber, part.content, instanceName);
                if (!sent) success = false;
            } 
            else if (part.type === WhatsappMediaType.IMAGE && part.mediaBase64) {
                const sent = await this.sendImage(finalNumber, part.mediaBase64, part.content || "", instanceName);
                if (!sent) success = false;
            }
        }

        return success;
    }

    async setWebhook(instanceName: string, url: string): Promise<boolean> {
        try {
            const settingsUrl = `${EVO_URL}/webhook/set/${instanceName}`;
            
            const payload = {
                webhook: {
                    url: url,
                    enabled: true,
                    byEvents: false,
                    base64: true,
                    events: [
                        EvolutionEvent._CONNECTION_UPDATE,
                        EvolutionEvent._MESSAGES_UPSERT,
                        EvolutionEvent._MESSAGES_UPDATE,
                        EvolutionEvent._QRCODE_UPDATED
                    ]
                }
            };

            await axios.post(settingsUrl, payload, { headers: EVO_HEADERS });
            return true;
        } catch (error) {
            const err = error as AxiosError;
            logger.error({ 
                err: err.response?.data, 
                instanceName,
                statusCode: err.response?.status 
            }, "[WhatsappService] Falha ao configurar webhook");
            return false;
        }
    }

    async updateSettings(instanceName: string): Promise<boolean> {
        try {
            const settingsUrl = `${EVO_URL}/settings/set/${instanceName}`;
            
            // Endpoint de settings na v2 costuma ser PLANO (flat)
            await axios.post(settingsUrl, {
                rejectCall: true,
                msgCall: "Desculpe, este número não aceita chamadas de voz.",
                groupsIgnore: true,
                alwaysOnline: true,
                readMessages: true,
                readStatus: false,
                syncFullHistory: false
            }, { headers: EVO_HEADERS });

            return true;
        } catch (error) {
            const err = error as AxiosError;
            logger.error({ err: err.response?.data, instanceName }, "[WhatsappService] Falha ao atualizar settings");
            return false;
        }
    }

    async createInstance(instanceName: string, enableQrcode: boolean = false): Promise<boolean> {
        try {
            logger.info({ instanceName, enableQrcode }, "[WhatsappService] Iniciando criação de instância...");
            const url = `${EVO_URL}/instance/create`;
            
            try {
                const payload = {
                    instanceName: instanceName,
                    token: env.EVOLUTION_API_KEY, 
                    qrcode: enableQrcode, 
                    integration: EvolutionIntegration.BAILEYS,
                    webhook: {
                        url: WEBHOOK_URL,
                        enabled: true,
                        byEvents: false,
                        events: [
                            EvolutionEvent._CONNECTION_UPDATE,
                            EvolutionEvent._MESSAGES_UPSERT,
                            EvolutionEvent._MESSAGES_UPDATE,
                            EvolutionEvent._QRCODE_UPDATED
                        ]
                    }
                };

                await axios.post(url, payload, { headers: EVO_HEADERS });
                await this.updateSettings(instanceName);
                return true;
            } catch (createError) {
                const err = createError as AxiosError;
                
                if (err.response?.status === 403) {
                    logger.warn({ instanceName }, "[WhatsappService] Instância já existe. Reconfigurando...");
                    
                    await this.setWebhook(instanceName, WEBHOOK_URL);
                    await this.updateSettings(instanceName);
                    return true;
                }
                throw createError;
            }
        } catch (error) {
            const err = error as AxiosError;
            logger.error({ 
                err: err.response?.data || err.message, 
                instanceName 
            }, "[WhatsappService] Falha crítica ao criar/verificar instância");
            return false;
        }
    }

    async connectInstance(instanceName: string, phoneNumber?: string): Promise<ConnectInstanceResponse> {
        try {
            logger.info({ instanceName, mode: phoneNumber ? "PairingCode" : "QRCode" }, "[WhatsappService] Iniciando fluxo de conexão");

            const status = await this.getInstanceStatus(instanceName);
            const exists = status.state !== WhatsappStatus.UNKNOWN;
            const isWorking = status.state === WhatsappStatus.CONNECTED || status.state === WhatsappStatus.OPEN;

            // 1. Se já está funcionando, apenas garante que as configurações estão corretas (silenciosamente)
            if (isWorking) {
                logger.info({ instanceName }, "[WhatsappService] Instância já conectada. Sincronizando presets...");
                await this.setWebhook(instanceName, WEBHOOK_URL);
                await this.updateSettings(instanceName);
                return { instance: { state: WhatsappStatus.OPEN } };
            }

            // 2. Se a instância NÃO existe, cria do zero
            if (!exists) {
                logger.info({ instanceName }, "[WhatsappService] Instância inexistente. Criando...");
                await this.createInstance(instanceName, !phoneNumber);
                await new Promise(r => setTimeout(r, 2000));
            } else {
                // 3. Se EXISTE mas não está funcional, APENAS reconfigura (sem POST /create que derruba a sessão)
                logger.info({ instanceName, state: status.state }, "[WhatsappService] Instância existe mas requer atenção. Sincronizando...");
                await this.setWebhook(instanceName, WEBHOOK_URL);
                await this.updateSettings(instanceName);
            }

            // Fluxo de Pairing Code
            if (phoneNumber) {
                const finalPhone = formatWhatsAppNumber(phoneNumber);

                const maxAttempts = 5;
                for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                    const url = `${EVO_URL}/instance/connect/${instanceName}?number=${finalPhone}`;
                    try {
                        const { data } = await axios.get<EvolutionConnectResponse>(url, { headers: EVO_HEADERS });
                        let pCode = data.pairingCode || (data.code && !data.code.startsWith("2@") ? data.code : undefined);

                        if (pCode && pCode.length >= 8) {
                            return { pairingCode: { code: pCode } };
                        }
                    } catch (e) {
                        const errCode = e as AxiosError;
                        logger.warn({ err: errCode.message, attempt }, "[WhatsappService] Falha ao tentar parear, tentando novamente...");
                    }
                    await new Promise(r => setTimeout(r, 2000));
                }
                throw new Error("Falha ao gerar código de pareamento.");
            }

            // Fluxo de QR Code (Tenta recuperar se já existir)
            const qrcUrl = `${EVO_URL}/instance/connect/${instanceName}`;
            const { data } = await axios.get<EvolutionConnectResponse>(qrcUrl, { headers: EVO_HEADERS });

            const base64 = data.qrcode?.base64 || data.base64;
            const code = data.qrcode?.code || data.code;

            if (base64) {
                return {
                    qrcode: {
                        base64: base64,
                        code: code
                    }
                };
            }

            // Se for bem sucedido em conectar sem QR (sessão recuperada)
            return { instance: { state: (data.instance?.state || status.state) as WhatsappStatus } };

        } catch (error) {
            const err = error as AxiosError;
            logger.error({ err: err.response?.data || err.message, instanceName }, "[WhatsappService] Falha ao conectar");
            throw new Error("Falha ao configurar conexão do WhatsApp.");
        }
    }

    async disconnectInstance(instanceName: string): Promise<boolean> {
        try {
            const url = `${EVO_URL}/instance/logout/${instanceName}`;
            await axios.delete(url, { headers: EVO_HEADERS });
            return true;
        } catch (err) {
            return false;
        }
    }

    async deleteInstance(instanceName: string): Promise<boolean> {
        try {
            const url = `${EVO_URL}/instance/delete/${instanceName}`;
            await axios.delete(url, { headers: EVO_HEADERS });
            return true;
        } catch (err) {
            return false;
        }
    }
}

export const whatsappService = new WhatsappService();

