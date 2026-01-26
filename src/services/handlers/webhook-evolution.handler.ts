import { GLOBAL_WHATSAPP_INSTANCE, WHATSAPP_STATUS } from "../../config/constants.js";
import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";
import { whatsappQueue } from "../../queues/whatsapp.queue.js";
import { whatsappService } from "../whatsapp.service.js";

// Constantes para controle de spam
const DISCONNECTION_NOTIFICATION_COOLDOWN_MS = 60 * 60 * 1000; // 1 hora
const MAX_NOTIFICATIONS_PER_DAY = 5;

export const webhookEvolutionHandler = {
    async handle(payload: any): Promise<boolean> {
        const { event, instance, data } = payload;
        
        // DEBUG: Log received webhooks (ignore presence updates)
        if (event !== "presence.update") {
             logger.info({ event, instance, dataKeys: Object.keys(data || {}) }, "Webhook Evolution: Recebido com sucesso!");
        }

        try {
            switch (event) {
                case "connection.update":
                    return await this.handleConnectionUpdate(instance, data);
                case "qrcode.updated":
                    return await this.handleQrCodeUpdated(instance, data);
                case "logout.instance":
                    return await this.handleLogoutInstance(instance, data);
                case "send.message":
                    return await this.handleSendMessage(instance, data);
                case "messages.update":
                    return await this.handleMessagesUpdate(instance, data);
                default:
                    // Ignorar eventos não mapeados silenciosamente
                    return true;
            }
        } catch (error) {
            logger.error({ error, event, instance }, "Erro ao processar webhook Evolution");
            return false;
        }
    },

    async handleQrCodeUpdated(instanceName: string, data: any): Promise<boolean> {
        // A Evolution API pode enviar o Pairing Code em diferentes formatos:
        // 1. data.pairingCode (direto)
        // 2. data.qrcode.pairingCode (aninhado)
        // 3. Às vezes vem como 'code' em vez de 'pairingCode'
        
        let pairingCode = data?.pairingCode || data?.qrcode?.pairingCode || data?.code;

        // Filtro anti-QR: Se começar com "2@", é um QR Code, não um Pairing Code
        if (pairingCode?.startsWith("2@")) {
            pairingCode = null;
        }

        // FORMATTER: xxxx-xxxx
        if (pairingCode && pairingCode.length === 8 && !pairingCode.includes("-")) {
            pairingCode = `${pairingCode.substring(0, 4)}-${pairingCode.substring(4)}`;
        }

        // Validação rigorosa
        if (!pairingCode || typeof pairingCode !== 'string' || pairingCode.trim().length === 0) {
            logger.warn({ 
                instanceName, 
                pairingCode,
                dataKeys: Object.keys(data || {}),
                fullData: JSON.stringify(data).substring(0, 200)
            }, "Webhook Evolution: qrcode.updated recebido mas pairingCode inválido. Ignorando.");
            return true; 
        }

        // Validação de formato: Pairing Code é curto (ex: "K2A5-Z9B1" ou "K2A5Z9B1")
        // Geralmente entre 8 e 24 caracteres
        if (pairingCode.length < 8 || pairingCode.length > 24) {
            logger.warn({ 
                instanceName, 
                length: pairingCode.length,
                pairingCode: pairingCode.substring(0, 4) + "***"
            }, "Webhook Evolution: pairingCode com tamanho inválido. Ignorando.");
            return true;
        }

        // Validação de instância
        if (!instanceName.startsWith("user_")) {
            logger.warn({ instanceName }, "Webhook Evolution: Instância não reconhecida (não começa com user_)");
            return false;
        }

        const usuarioId = instanceName.replace("user_", "");

        // Calcular expiração: Pairing Code dura ~60 segundos
        const expiresAt = new Date(Date.now() + 60000).toISOString();
        
        logger.info({ 
            instanceName, 
            pairingCode: pairingCode, 
            expiresAt,
            usuarioId 
        }, "Webhook Evolution: Salvando novo Pairing Code no banco.");

        const { error } = await supabaseAdmin
            .from("usuarios")
            .update({ 
                pairing_code: pairingCode, 
                pairing_code_expires_at: expiresAt,
                pairing_code_generated_at: new Date().toISOString()
            }) 
            .eq("id", usuarioId);

        if (error) {
            logger.error({ error, usuarioId }, "Falha ao salvar pairing_code via webhook");
            return false;
        }

        logger.info({ usuarioId, pairingCode: pairingCode }, "Pairing Code salvo com sucesso no banco (Realtime disparará para o frontend)");
        return true;
    },

    async handleConnectionUpdate(instanceName: string, data: any): Promise<boolean> {
        // data: { state: "open" | "close" | "connecting", statusReason: number }
        const { state, statusReason } = data;
        
        // Validação de estado
        if (!state || typeof state !== 'string') {
            logger.warn({ instanceName, state }, "Webhook Evolution: connection.update recebido mas state inválido");
            return false;
        }

        // Extrair ID do usuário: "user_{uuid}" -> "{uuid}"
        if (!instanceName.startsWith("user_")) {
            logger.warn({ instanceName }, "Webhook Evolution: Instância desconhecida (não começa com user_)");
            return false;
        }

        const usuarioId = instanceName.replace("user_", "");
        
        const statusMap: Record<string, string> = {
            open: WHATSAPP_STATUS.CONNECTED,
            connected: WHATSAPP_STATUS.CONNECTED,
            close: WHATSAPP_STATUS.DISCONNECTED,
            disconnected: WHATSAPP_STATUS.DISCONNECTED,
            connecting: WHATSAPP_STATUS.CONNECTING
        };

        const dbStatus = statusMap[state.toLowerCase()] || WHATSAPP_STATUS.DISCONNECTED;
        
        const updateData: any = { 
            whatsapp_status: dbStatus,
            whatsapp_last_status_change_at: new Date().toISOString()
        };
        
        // Se conectou, limpa o código de pareamento e reprocessa mensagens pendentes
        if (state === "open" || state === "connected") {
             updateData.pairing_code = null;
             updateData.pairing_code_expires_at = null;
             updateData.pairing_code_generated_at = null;
             updateData.disconnection_notification_count = 0; // Reset counter on successful connection
             
             // NOTIFICAR SUCESSO DE CONEXÃO
             // Envia mensagem pela instância GLOBAL para garantir entrega
             try {
                const { data: usuario } = await supabaseAdmin.from("usuarios").select("nome, telefone").eq("id", usuarioId).single();
                if (usuario && usuario.telefone) {
                    const msgConectado = `Olá ${usuario.nome}! 🚀\n\nSeu WhatsApp foi conectado com sucesso ao Van360!\nAgora você receberá notificações automáticas por aqui.\n\nQualquer dúvida, estamos à disposição.`;
                    await whatsappService.sendText(usuario.telefone, msgConectado, GLOBAL_WHATSAPP_INSTANCE);
                    logger.info({ usuarioId, telefone: usuario.telefone }, "Notificação de conexão bem-sucedida enviada.");
                }
             } catch (notifyErr) {
                 logger.error({ notifyErr, usuarioId }, "Falha ao enviar notificação de boas-vindas da conexão");
             }

             // Reprocessar mensagens que falharam para esta instância
             try {
                  await this.reprocessFailedJobs(instanceName);
             } catch (err) {
                  logger.error({ err, instanceName }, "Erro ao reprocessar jobs falhados");
             }
        }

        logger.info({ 
            instanceName, 
            state, 
            dbStatus,
            statusReason,
            usuarioId
        }, "Webhook Evolution: Atualizando status de conexão");

        // Atualizar Banco
        const { error } = await supabaseAdmin
            .from("usuarios")
            .update(updateData)
            .eq("id", usuarioId);

        if (error) {
            logger.error({ error, usuarioId, state }, "Falha ao atualizar whatsapp_status via webhook");
            return false;
        }

        // Se desconectou, disparar notificação
        if (state === "close" || state === "disconnected") {
            logger.warn({ usuarioId, statusReason }, "Webhook Evolution: WhatsApp desconectou. Verificando se deve notificar...");
            await this.notifyMotoristaDisconnection(usuarioId, statusReason);
        }

        return true;
    },

    /**
     * Processa confirmação de envio de mensagem
     * Atualiza o status da cobrança para "Enviada" quando a Evolution confirma
     */
    async handleSendMessage(instanceName: string, data: any): Promise<boolean> {
        try {
            const { messageId, status, number } = data;
            
            if (!instanceName.startsWith("user_")) {
                return true;
            }

            const usuarioId = instanceName.replace("user_", "");

            logger.debug({ 
                instanceName, 
                messageId, 
                status, 
                number 
            }, "Webhook Evolution: send.message recebido");

            // Aqui você pode atualizar o status da cobrança/notificação no banco
            // se tiver um mapeamento de messageId -> cobrancaId
            // Por enquanto, apenas log para auditoria
            
            return true;
        } catch (error) {
            logger.error({ error, instanceName }, "Erro ao processar send.message");
            return false;
        }
    },

    /**
     * Processa atualização de status de mensagem (entregue, lida, etc)
     * Útil para rastreamento de confirmação de leitura
     */
    async handleMessagesUpdate(instanceName: string, data: any): Promise<boolean> {
        try {
            const { messageId, status, fromMe } = data;
            
            // Ignorar mensagens recebidas (fromMe = false)
            // Focar apenas em mensagens que o sistema enviou
            if (!fromMe) {
                return true;
            }

            if (!instanceName.startsWith("user_")) {
                return true;
            }

            logger.debug({ 
                instanceName, 
                messageId, 
                status 
            }, "Webhook Evolution: messages.update recebido (mensagem enviada)");

            // Aqui você pode atualizar o status da cobrança para "Lida" quando status === "read"
            // Por enquanto, apenas log para auditoria
            
            return true;
        } catch (error) {
            logger.error({ error, instanceName }, "Erro ao processar messages.update");
            return false;
        }
    },

    /**
     * Reprocessa jobs que falharam para uma instância que acabou de reconectar
     */
    async reprocessFailedJobs(instanceName: string): Promise<void> {
        try {
            const failedJobs = await whatsappQueue.getFailed();
            
            if (!failedJobs || failedJobs.length === 0) {
                logger.info({ instanceName }, "Nenhum job falhado para reprocessar");
                return;
            }
            
            // Filtrar jobs que eram para esta instância
            const relevantJobs = failedJobs.filter(job => 
                job.data?.options?.instanceName === instanceName
            );
            
            if (relevantJobs.length === 0) {
                logger.info({ instanceName }, "Nenhum job falhado específico para esta instância");
                return;
            }
            
            logger.info({ instanceName, count: relevantJobs.length }, "Reprocessando jobs falhados...");
            
            // Adicionar novamente à fila com alta prioridade
            for (const failedJob of relevantJobs) {
                try {
                    await whatsappQueue.add('send-message', failedJob.data, {
                        priority: 100, // Muito alta prioridade
                        jobId: `retry-${failedJob.id}-${Date.now()}`,
                        removeOnComplete: true
                    });
                    
                    logger.debug({ jobId: failedJob.id, instanceName }, "Job readicionado à fila com alta prioridade");
                } catch (err) {
                    logger.error({ err, jobId: failedJob.id }, "Erro ao readicionar job à fila");
                }
            }
            
            logger.info({ instanceName, count: relevantJobs.length }, "Reprocessamento de jobs concluído");
        } catch (error) {
            logger.error({ error, instanceName }, "Erro ao reprocessar jobs falhados");
        }
    },

    /**
     * Notifica o motorista sobre desconexão do WhatsApp
     * Implementa controle de spam para evitar múltiplas notificações
     */
    async notifyMotoristaDisconnection(usuarioId: string, statusReason?: number): Promise<void> {
        try {
            // 1. Buscar dados do motorista e histórico de notificações
            const { data: usuario, error: fetchError } = await supabaseAdmin
                .from("usuarios")
                .select("id, telefone, nome, last_disconnection_notification_at, disconnection_notification_count, whatsapp_status")
                .eq("id", usuarioId)
                .single();
            
            if (fetchError || !usuario?.telefone) {
                logger.warn({ usuarioId, error: fetchError }, "Motorista não encontrado ou sem telefone. Notificação não enviada.");
                return;
            }

            // 2. Verificar cooldown para evitar spam
            const lastNotificationTime = usuario.last_disconnection_notification_at 
                ? new Date(usuario.last_disconnection_notification_at).getTime() 
                : 0;
            const now = Date.now();
            const timeSinceLastNotification = now - lastNotificationTime;

            logger.info({ 
                usuarioId, 
                timeSinceLastNotification, 
                cooldown: DISCONNECTION_NOTIFICATION_COOLDOWN_MS,
                lastNotification: usuario.last_disconnection_notification_at,
                currentStatus: usuario.whatsapp_status
            }, "Verificando cooldown de notificação...");

            if (timeSinceLastNotification < DISCONNECTION_NOTIFICATION_COOLDOWN_MS) {
                logger.info({ 
                    usuarioId, 
                    timeSinceLastNotification,
                    cooldown: DISCONNECTION_NOTIFICATION_COOLDOWN_MS
                }, "Notificação de desconexão bloqueada por cooldown (spam prevention)");
                return;
            }

            // 3. Verificar limite diário de notificações
            if (usuario.disconnection_notification_count >= MAX_NOTIFICATIONS_PER_DAY) {
                logger.warn({ 
                    usuarioId, 
                    count: usuario.disconnection_notification_count,
                    limit: MAX_NOTIFICATIONS_PER_DAY
                }, "Limite diário de notificações atingido");
                return;
            }

            // 4. Montar mensagem
            const mensagem = `Olá ${usuario.nome}! 👋\n\nSeu WhatsApp desconectou do Van360. Para manter o envio de notificações de cobranças ativo, acesse o sistema e reconecte agora.\n\nQualquer dúvida, entre em contato conosco.`;
            
            logger.info({ usuarioId, telefone: usuario.telefone }, "Enviando notificação de desconexão...");

            // 5. Enviar via instância principal
            const enviado = await whatsappService.sendText(
                usuario.telefone,
                mensagem,
                GLOBAL_WHATSAPP_INSTANCE
            );
            
            if (enviado) {
                logger.info({ usuarioId }, "Notificação de desconexão enviada com sucesso");
                
                // 6. Atualizar timestamp e contador
                await supabaseAdmin
                    .from("usuarios")
                    .update({
                        last_disconnection_notification_at: new Date().toISOString(),
                        disconnection_notification_count: (usuario.disconnection_notification_count || 0) + 1
                    })
                    .eq("id", usuarioId);
            } else {
                logger.warn({ usuarioId }, "Falha ao enviar notificação de desconexão (instância principal pode estar offline)");
            }
        } catch (error) {
            logger.error({ error, usuarioId }, "Erro ao notificar desconexão");
        }
    },

    async handleLogoutInstance(instanceName: string, data: any): Promise<boolean> {
        logger.info({ instanceName }, "Webhook Evolution: logout.instance recebido. Marcando como desconectado.");
        
        if (!instanceName.startsWith("user_")) {
            return true;
        }

        const usuarioId = instanceName.replace("user_", "");

        const { error } = await supabaseAdmin
            .from("usuarios")
            .update({ 
                whatsapp_status: WHATSAPP_STATUS.DISCONNECTED,
                pairing_code: null,
                pairing_code_expires_at: null,
                pairing_code_generated_at: null,
                whatsapp_last_status_change_at: new Date().toISOString()
            })
            .eq("id", usuarioId);

        if (error) {
            logger.error({ error, usuarioId }, "Falha ao processar logout.instance via webhook");
            return false;
        }

        // NOTIFICAR MOTORISTA
        await this.notifyMotoristaDisconnection(usuarioId);

        return true;
    }
};
