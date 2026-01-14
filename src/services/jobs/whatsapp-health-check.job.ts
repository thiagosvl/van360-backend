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
        logger.info("Starting WhatsApp Health Check Job (V2)...");

        const result: HealthCheckResult = {
            totalChecked: 0,
            fixed: 0,
            errors: 0,
            details: []
        };

        // 1. Buscar todos os usuários supostamente conectados
        const { data: usuarios, error } = await supabaseAdmin
            .from("usuarios")
            .select("id, nome, whatsapp_status, telefone")
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
                // Retry logic: até 2 tentativas
                let apiStatus = null;
                for (let attempt = 0; attempt < 2; attempt++) {
                    try {
                        apiStatus = await whatsappService.getInstanceStatus(instanceName);
                        break;
                    } catch (err) {
                        await new Promise(r => setTimeout(r, 500));
                    }
                }

                if (!apiStatus) throw new Error("Falha ao obter status após retries");

                // Mapeia status da API para status do DB
                let realStatus: string = WHATSAPP_STATUS.DISCONNECTED;

                if (apiStatus.state === "open") {
                    realStatus = WHATSAPP_STATUS.CONNECTED;
                } else if (apiStatus.state === "connecting") {
                    // SE ESTIVER CONNECTING: Dar uma chance (Timeout)
                    // A Evolution as vezes fica connecting por um tempo.
                    // Não queremos desconectar prematuramente.
                    logger.warn({ instanceName }, "Health Check: Instance 'connecting'. Aguardando 15s...");
                    await new Promise(r => setTimeout(r, 15000));
                    const retryStatus = await whatsappService.getInstanceStatus(instanceName);
                    
                    if (retryStatus.state === "open") {
                         realStatus = WHATSAPP_STATUS.CONNECTED;
                    } else if (retryStatus.state === "connecting") {
                         // Se ainda estiver connecting, consideramos DISCONNECTED para forçar reconexão limpa
                         // Ou mantemos 'connecting'? O ideal é matar para não ficar zumbi.
                         realStatus = WHATSAPP_STATUS.DISCONNECTED;
                         logger.warn({ instanceName }, "Health Check: Instance travada em 'connecting'. Marcando como desconectado.");
                         // Opcional: Kill instance here?
                         await whatsappService.disconnectInstance(instanceName);
                    } else {
                         realStatus = WHATSAPP_STATUS.DISCONNECTED;
                    }
                } else {
                    realStatus = WHATSAPP_STATUS.DISCONNECTED;
                }

                // Se houver discrepância, corrige o banco
                if (realStatus !== usuario.whatsapp_status) {
                    logger.warn({ 
                        usuarioId: usuario.id, 
                        dbStatus: usuario.whatsapp_status, 
                        newStatus: realStatus 
                    }, "Health Check: Discrepância encontrada. Corrigindo...");

                    await supabaseAdmin
                        .from("usuarios")
                        .update({ whatsapp_status: realStatus })
                        .eq("id", usuario.id);

                    // Se desconectou, avisa o motorista
                    if (realStatus === WHATSAPP_STATUS.DISCONNECTED && usuario.whatsapp_status === WHATSAPP_STATUS.CONNECTED) {
                         if (usuario.telefone) {
                             await notificationService.notifyDriver(usuario.telefone, DRIVER_EVENT_WHATSAPP_DISCONNECTED, {
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
