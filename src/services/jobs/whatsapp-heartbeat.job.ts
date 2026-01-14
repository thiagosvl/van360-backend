
import { WHATSAPP_STATUS } from "../../config/constants.js";
import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";
import { whatsappService } from "../whatsapp.service.js";

interface HeartbeatResult {
    totalChecked: number;
    healthy: number;
    unhealthy: number;
    errors: number;
}

export const whatsappHeartbeatJob = {
    async run(): Promise<HeartbeatResult> {
        // logger.info("Starting WhatsApp Heartbeat Job...");

        const result: HeartbeatResult = {
            totalChecked: 0,
            healthy: 0,
            unhealthy: 0,
            errors: 0
        };

        // Buscar usuários conectados
        const { data: usuarios, error } = await supabaseAdmin
            .from("usuarios")
            .select("id, whatsapp_status")
            .eq("whatsapp_status", WHATSAPP_STATUS.CONNECTED);

        if (error) {
            logger.error({ error }, "Heartbeat: Falha ao buscar usuários.");
            throw error;
        }

        if (!usuarios || usuarios.length === 0) {
            return result;
        }

        result.totalChecked = usuarios.length;

        // Fazer ping em cada instância (simultaneo para ser rápido)
        await Promise.all(usuarios.map(async (usuario) => {
            const instanceName = whatsappService.getInstanceName(usuario.id);
            try {
                // O simples fato de chamar getInstanceStatus já serve como "ping" para a Evolution
                const status = await whatsappService.getInstanceStatus(instanceName);
                
                if (status.state === "open") {
                    result.healthy++;
                } else {
                    result.unhealthy++;
                    // Não logar warn toda vez para não floodar, apenas contar
                }
            } catch (err: any) {
                result.errors++;
            }
        }));

        // logger.info({ result }, "WhatsApp Heartbeat Job Finished.");
        return result;
    }
};
