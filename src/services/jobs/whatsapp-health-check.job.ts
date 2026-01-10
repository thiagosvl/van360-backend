import { DRIVER_EVENT_WHATSAPP_DISCONNECTED, WHATSAPP_STATUS } from "../../config/constants.js";
import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";
import { notificationService } from "../notifications/notification.service.js";
import { whatsappService } from "../whatsapp.service.js";

interface HealthCheckResult {
    totalChecked: number;
    fixed: number;
    errors: number;
    details: Array<{ usuarioId: string, oldStatus: string, newStatus: string, reason?: string }>;
}

export const whatsappHealthCheckJob = {
    async run(): Promise<HealthCheckResult> {
        logger.info("Starting WhatsApp Health Check Job...");

        const result: HealthCheckResult = {
            totalChecked: 0,
            fixed: 0,
            errors: 0,
            details: []
        };

        // 1. Buscar todos os usuários supostamente conectados
        const { data: usuarios, error } = await supabaseAdmin
            .from("usuarios")
            .select("id, nome, whatsapp_status")
            .eq("whatsapp_status", WHATSAPP_STATUS.CONNECTED);

        if (error) {
            logger.error({ error }, "Health Check: Falha ao buscar usuários conectados.");
            throw error;
        }

        if (!usuarios || usuarios.length === 0) {
            logger.info("Health Check: Nenhum usuário conectado para verificar.");
            return result;
        }

        result.totalChecked = usuarios.length;

        // 2. Iterar e Validar
        for (const usuario of usuarios) {
            const instanceName = whatsappService.getInstanceName(usuario.id);
            
            try {
                const apiStatus = await whatsappService.getInstanceStatus(instanceName);
                
                // Mapeia status da API para status do DB (Lógica similar ao Webhook)
                let realStatus: string = WHATSAPP_STATUS.DISCONNECTED;

                if (apiStatus.state === "open") {
                    realStatus = WHATSAPP_STATUS.CONNECTED;
                } else if (apiStatus.state === "connecting") {
                    realStatus = WHATSAPP_STATUS.CONNECTING;
                } else {
                    realStatus = WHATSAPP_STATUS.DISCONNECTED;
                }

                // Se houver discrepância, corrige o banco
                if (realStatus !== usuario.whatsapp_status) {
                    logger.warn({ 
                        usuarioId: usuario.id, 
                        dbStatus: usuario.whatsapp_status, 
                        apiStatus: apiStatus.state 
                    }, "Health Check: Discrepância encontrada. Corrigindo...");

                    await supabaseAdmin
                        .from("usuarios")
                        .update({ whatsapp_status: realStatus })
                        .eq("id", usuario.id);

                    // Se desconectou, avisa o motorista pela instância global
                    if (realStatus === WHATSAPP_STATUS.DISCONNECTED && usuario.whatsapp_status === WHATSAPP_STATUS.CONNECTED) {
                         const { data: motorista } = await supabaseAdmin.from("usuarios").select("telefone").eq("id", usuario.id).single();
                         if (motorista?.telefone) {
                             await notificationService.notifyDriver(motorista.telefone, DRIVER_EVENT_WHATSAPP_DISCONNECTED, {
                                 // Campos obrigatórios do Context, mesmo que não usados no template específico
                                 nomeMotorista: usuario.nome || "Motorista",
                                 nomePlano: "N/A",
                                 valor: 0,
                                 dataVencimento: new Date().toISOString()
                             });
                             logger.info({ usuarioId: usuario.id }, "Health Check: Notificação de desconexão enviada.");
                         }
                    }

                    result.fixed++;
                    result.details.push({
                        usuarioId: usuario.id,
                        oldStatus: usuario.whatsapp_status,
                        newStatus: realStatus,
                        reason: `API returned ${apiStatus.state}`
                    });
                }

            } catch (err: any) {
                logger.error({ err: err.message, usuarioId: usuario.id }, "Health Check: Erro ao verificar instância individual.");
                result.errors++;
            }
        }

        logger.info({ result }, "WhatsApp Health Check Job Finished.");
        return result;
    }
};
