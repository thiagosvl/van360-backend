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

        // 1. Buscar todos os usuários que O SISTEMA acha que estão conectados
        const { data: usuarios, error } = await supabaseAdmin
            .from("usuarios")
            .select("id, nome, whatsapp_status, telefone")
            .eq("whatsapp_status", WHATSAPP_STATUS.CONNECTED);

        if (error) {
            logger.error({ error }, "Health Check: Falha ao buscar usuários conectados.");
            throw error;
        }

        if (!usuarios || usuarios.length === 0) {
            // logger.info("Health Check: Nenhum usuário conectado para verificar.");
            return result;
        }

        result.totalChecked = usuarios.length;

        // 2. Iterar e Validar com a realidade (Evolution API)
        for (const usuario of usuarios) {
            const instanceName = whatsappService.getInstanceName(usuario.id);
            
            try {
                // Retry logic: até 2 tentativas para evitar falso negativo por timeout
                let apiStatus = null;
                for (let attempt = 0; attempt < 2; attempt++) {
                    try {
                        apiStatus = await whatsappService.getInstanceStatus(instanceName);
                        break;
                    } catch (err) {
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }

                if (!apiStatus) throw new Error("Falha ao obter status após retries");

                // Mapeia status da API para status do DB
                let realStatus: string = WHATSAPP_STATUS.DISCONNECTED;

                if (apiStatus.state === "open") {
                    realStatus = WHATSAPP_STATUS.CONNECTED;
                } else if (apiStatus.state === "connecting") {
                    // SE ESTIVER CONNECTING: Dar uma chance (Timeout)
                    logger.warn({ instanceName }, "Health Check: Instance 'connecting'. Aguardando 10s...");
                    await new Promise(r => setTimeout(r, 10000));
                    
                    const retryStatus = await whatsappService.getInstanceStatus(instanceName);
                    
                    if (retryStatus.state === "open") {
                         realStatus = WHATSAPP_STATUS.CONNECTED;
                    } else {
                         // Se continuar connecting ou cair, consideramos DISCONNECTED.
                         // Se travou em connecting por muito tempo, melhor matar.
                         realStatus = WHATSAPP_STATUS.DISCONNECTED;
                         
                         // Se tiver travado, faz um cleanup silencioso
                         if (retryStatus.state === "connecting") {
                            logger.warn({ instanceName }, "Health Check: Instance travada em 'connecting'. Limpando...");
                            await whatsappService.disconnectInstance(instanceName);
                            await whatsappService.deleteInstance(instanceName);
                         }
                    }
                } else {
                    realStatus = WHATSAPP_STATUS.DISCONNECTED;
                }

                // Se houver discrepância (DB diz Connected, API diz Disconnected), corrige o banco
                if (realStatus !== usuario.whatsapp_status && realStatus === WHATSAPP_STATUS.DISCONNECTED) {
                    logger.warn({ 
                        usuarioId: usuario.id, 
                        dbStatus: usuario.whatsapp_status, 
                        realStatus,
                        apiState: apiStatus.state
                    }, "Health Check: Discrepância encontrada. Corrigindo DB para DISCONNECTED.");

                    await supabaseAdmin
                        .from("usuarios")
                        .update({ whatsapp_status: WHATSAPP_STATUS.DISCONNECTED })
                        .eq("id", usuario.id);

                    // Notificar motorista que caiu!
                    if (usuario.telefone) {
                         try {
                              await notificationService.notifyDriver(
                                   usuario.telefone, 
                                   DRIVER_EVENT_WHATSAPP_DISCONNECTED, 
                                   { 
                                        nomeMotorista: usuario.nome || "Motorista",
                                        nomePlano: "Essencial", // Dummy for context
                                        valor: 0,
                                        dataVencimento: new Date()
                                   } as any 
                              );
                              logger.info({ usuarioId: usuario.id }, "Notificação de WhatsApp desconectado enviada.");
                         } catch (notifErr) {
                              logger.error({ notifErr }, "Falha ao enviar notificação de desconexão.");
                         }
                    }

                    result.fixed++;
                    result.details.push({
                        usuarioId: usuario.id,
                        oldStatus: usuario.whatsapp_status,
                        newStatus: realStatus,
                        reason: `API state: ${apiStatus.state}`
                    });
                } else if (realStatus === WHATSAPP_STATUS.CONNECTED && usuario.whatsapp_status !== WHATSAPP_STATUS.CONNECTED) {
                    // Caso raro: DB diz Disconnected, mas API diz Connected.
                    // Isso pode acontecer se o Webhook falhar na conexão. O Health Check corrige.
                    logger.info({ usuarioId: usuario.id }, "Health Check: Reconciliando status para CONNECTED (Webhook falhou?)");
                    await supabaseAdmin
                        .from("usuarios")
                        .update({ whatsapp_status: WHATSAPP_STATUS.CONNECTED })
                        .eq("id", usuario.id);
                    result.fixed++;
                }

            } catch (err: any) {
                logger.error({ err: err.message, usuarioId: usuario.id }, "Health Check: Erro ao verificar instância individual.");
                result.errors++;
            }
        }

        if (result.fixed > 0) {
            logger.info({ result }, "WhatsApp Health Check Job Completed with fixes.");
        }
        
        return result;
    }
};
