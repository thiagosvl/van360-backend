import { FastifyReply, FastifyRequest } from "fastify";
import { WHATSAPP_STATUS } from "../config/constants.js";
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { ConnectInstanceResponse, whatsappService } from "../services/whatsapp.service.js";

// Helper para buscar ID interno
async function getUsuarioId(authUid: string): Promise<{ id: string | null, telefone: string | null, error?: string }> {
    const { data: usuario, error } = await supabaseAdmin
        .from("usuarios")
        .select("id, whatsapp_status, telefone")
        .eq("auth_uid", authUid)
        .maybeSingle(); 
    
    if (error) return { id: null, telefone: null, error: `DB Error: ${error.message}` };
    if (!usuario) return { id: null, telefone: null, error: "Record not found" };
    return { id: usuario.id, telefone: usuario.telefone };
}

export const whatsappController = {
  status: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        const authUid = (request as any).user?.id;
        if (!authUid) return reply.status(401).send({ error: "Não autorizado." });

        const { id: usuarioId, error } = await getUsuarioId(authUid);
        
        if (!usuarioId) {
            // Se o usuário ainda não existe na tabela 'usuarios' (recém criado no Auth),
            // retornamos um estado limpo.
            return reply.send({ 
                instanceName: null, 
                state: "UNKNOWN" 
            });
        }

        const instanceName = whatsappService.getInstanceName(usuarioId);

        // Consultar Evolution
        const evoStatus = await whatsappService.getInstanceStatus(instanceName);

        // SELF-HEALING: Atualizar DB se houver discrepância
        let realStatus: string = WHATSAPP_STATUS.DISCONNECTED;
        if (evoStatus.state === "open" || evoStatus.state === "connected") realStatus = WHATSAPP_STATUS.CONNECTED;
        else if (evoStatus.state === "connecting") realStatus = WHATSAPP_STATUS.CONNECTING;

        // Se o status real for diferente do status no banco (e não for erro de leitura), atualiza
        // (Ignora UNKNOWN/ERROR para não sujar o banco com falsos negativos se a API cair)
        const { data: userData } = await supabaseAdmin
            .from("usuarios")
            .select("whatsapp_status, pairing_code, pairing_code_expires_at")
            .eq("id", usuarioId)
            .single();

        const dbStatus = userData?.whatsapp_status || "UNKNOWN";
        const persistedPairingCode = userData?.pairing_code;
        const persistedExpiresAt = userData?.pairing_code_expires_at;

        // VALIDAÇÃO DE EXPIRAÇÃO (Smart Cleanup)
        let cleanPairingCode = persistedPairingCode;
        let cleanExpiresAt = persistedExpiresAt;

        const isExpired = persistedExpiresAt ? new Date(persistedExpiresAt).getTime() < Date.now() : true;
        
        // SÓ limpa se o estado realmente não permitir mais conexão (CONNECTED) 
        // ou se expirou há mais de 10 segundos (margem de segurança para rede)
        const expiryThreshold = persistedExpiresAt ? new Date(persistedExpiresAt).getTime() + 10000 : 0;
        const isDefinitivelyExpired = Date.now() > expiryThreshold;
        const isInvalidState = realStatus === WHATSAPP_STATUS.CONNECTED; 

        // Se expirou e NÃO estamos em connecting, ou se já conectou, limpar
        if ((persistedPairingCode && isDefinitivelyExpired) || (persistedPairingCode && isInvalidState)) {
             logger.info({ usuarioId, reason: isExpired ? "Expired" : "InvalidState" }, "Status Check: Limpando Pairing Code antigo/inválido");
             await supabaseAdmin.from("usuarios")
                .update({ pairing_code: null, pairing_code_expires_at: null })
                .eq("id", usuarioId);
             
             cleanPairingCode = null;
             cleanExpiresAt = null;
        }

        if (realStatus !== dbStatus && evoStatus.state !== "ERROR" && evoStatus.state !== WHATSAPP_STATUS.NOT_FOUND) {
             logger.info({ usuarioId, real: realStatus, db: dbStatus }, "Status Check: Corrigindo status no banco (Self-Healing on Read)");
             await supabaseAdmin.from("usuarios").update({ whatsapp_status: realStatus }).eq("id", usuarioId);
        }
        
        return reply.send({
            instanceName,
            ...evoStatus,
            pairingCode: cleanPairingCode,
            pairingCodeExpiresAt: cleanExpiresAt
        });
    } catch (err: any) {
        return reply.status(500).send({ error: err.message });
    }
  },

  connect: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        const authUid = (request as any).user?.id;
        const body = request.body as { phoneNumber?: string } | undefined;
        const phoneNumber = body?.phoneNumber;

        logger.info({ authUid, phoneNumber, endpoint: "connect" }, "WhatsappController.connect - Request received");
        if (!authUid) return reply.status(401).send({ error: "Não autorizado." });

        const { id: usuarioId } = await getUsuarioId(authUid);
        if (!usuarioId) return reply.status(404).send({ error: "Perfil não encontrado." });

        const instanceName = whatsappService.getInstanceName(usuarioId);
        logger.debug({ instanceName }, "WhatsappController.connect - Instance Name Resolved");

        const result: ConnectInstanceResponse = await whatsappService.connectInstance(instanceName, phoneNumber);
        
        // Se já conectado, atualizar DB local (opcional, mas bom pra cache)
        if (result.instance?.state === "open") {
              logger.info({ instanceName }, "WhatsappController.connect - Already Open, updating DB");
              await supabaseAdmin.from("usuarios")
                .update({ whatsapp_status: WHATSAPP_STATUS.CONNECTED })
                .eq("id", usuarioId);
        }

        return reply.send(result);
    } catch (err: any) {
          logger.error({ err: err.message, stack: err.stack }, "WhatsappController.connect - Failed");
          return reply.status(500).send({ error: err.message });
    }
  },

  requestPairingCode: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        const authUid = (request as any).user?.id;
        
        if (!authUid) return reply.status(401).send({ error: "Não autorizado." });

        const { id: usuarioId, telefone } = await getUsuarioId(authUid);
        
        logger.info({ authUid, usuarioId, hasTelefone: !!telefone, endpoint: "requestPairingCode" }, "WhatsappController.requestPairingCode - Request received");

        if (!usuarioId) return reply.status(404).send({ error: "Perfil não encontrado." });
        if (!telefone) return reply.status(400).send({ error: "Número de telefone não cadastrado no perfil." });

        const instanceName = whatsappService.getInstanceName(usuarioId);

        // URGENT FIX: Use the unified connectInstance method which handles the cleanup logic
        const result: ConnectInstanceResponse = await whatsappService.connectInstance(instanceName, telefone);
        
        // PERSISTENCE: Save to DB if we got a code
        if (result.pairingCode?.code) {
             let codeToSave = result.pairingCode.code;
             
             // FORMATTER: xxxx-xxxx
             if (codeToSave.length === 8 && !codeToSave.includes("-")) {
                 codeToSave = `${codeToSave.substring(0, 4)}-${codeToSave.substring(4)}`;
             }

             const now = new Date();
             const expiresAt = new Date(now.getTime() + 60000); // +60s

             logger.info({ 
                usuarioId, 
                code: result.pairingCode.code, 
                expiresAt: expiresAt.toISOString() 
             }, "WhatsappController: Pairing Code gerado e persistido.");

             await supabaseAdmin.from("usuarios")
                .update({ 
                    pairing_code: codeToSave,
                    pairing_code_generated_at: now.toISOString(),
                    pairing_code_expires_at: expiresAt.toISOString(),
                })
                .eq("id", usuarioId);
        }

        return reply.send(result);
    } catch (err: any) {
          logger.error({ err: err.message, stack: err.stack }, "WhatsappController.requestPairingCode - Failed");
          return reply.status(500).send({ error: err.message });
    }
  },

  disconnect: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        const authUid = (request as any).user?.id;
        logger.info({ authUid, endpoint: "disconnect" }, "WhatsappController.disconnect - Request received");
        if (!authUid) return reply.status(401).send({ error: "Não autorizado." });

        const { id: usuarioId } = await getUsuarioId(authUid);
        if (!usuarioId) return reply.status(404).send({ error: "Perfil não encontrado." });

        const instanceName = whatsappService.getInstanceName(usuarioId);

        // "Nuclear Option": Reset completo da instância para garantir que não haja
        // "Sessões Zumbis" atrapalhando a próxima conexão (Lite Mode).
        logger.info({ instanceName }, "Disconnecting and Deleting instance (Clean Slate)...");
        await whatsappService.disconnectInstance(instanceName);
        await whatsappService.deleteInstance(instanceName);
        
        // Atualizar DB
        await supabaseAdmin.from("usuarios")
            .update({ whatsapp_status: WHATSAPP_STATUS.DISCONNECTED })
            .eq("id", usuarioId);

        return reply.send({ success: true });
    } catch (err: any) {
        logger.error({ err: err.message }, "WhatsappController.disconnect - Failed");
        return reply.status(500).send({ error: err.message });
    }
  }
};
