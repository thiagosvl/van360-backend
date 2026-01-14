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
        
        return reply.send({
            instanceName,
            ...evoStatus
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

        logger.info({ authUid, phoneNumber }, "WhatsappController.connect - Request received");
        if (!authUid) return reply.status(401).send({ error: "Não autorizado." });

        const { id: usuarioId } = await getUsuarioId(authUid);
        if (!usuarioId) return reply.status(404).send({ error: "Perfil não encontrado." });

        const instanceName = whatsappService.getInstanceName(usuarioId);

        const result: ConnectInstanceResponse = await whatsappService.connectInstance(instanceName, phoneNumber);
        
        // Se já conectado, atualizar DB local (opcional, mas bom pra cache)
        if (result.instance?.state === "open") {
              await supabaseAdmin.from("usuarios")
                .update({ whatsapp_status: WHATSAPP_STATUS.CONNECTED })
                .eq("id", usuarioId);
        }

        return reply.send(result);
    } catch (err: any) {
          return reply.status(500).send({ error: err.message });
    }
  },

  requestPairingCode: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        const authUid = (request as any).user?.id;
        
        if (!authUid) return reply.status(401).send({ error: "Não autorizado." });

        const { id: usuarioId, telefone } = await getUsuarioId(authUid);
        
        logger.info({ authUid, usuarioId, hasTelefone: !!telefone }, "WhatsappController.requestPairingCode - Request received");

        if (!usuarioId) return reply.status(404).send({ error: "Perfil não encontrado." });
        if (!telefone) return reply.status(400).send({ error: "Número de telefone não cadastrado no perfil." });

        const instanceName = whatsappService.getInstanceName(usuarioId);

        // URGENT FIX: Use the unified connectInstance method which handles the cleanup logic
        const result: ConnectInstanceResponse = await whatsappService.connectInstance(instanceName, telefone);
        
        // PERSISTENCE: Save to DB if we got a code
        if (result.pairingCode?.code) {
             const now = new Date();
             const expiresAt = new Date(now.getTime() + 60000); // +60s

             await supabaseAdmin.from("usuarios")
                .update({ 
                    pairing_code: result.pairingCode.code,
                    pairing_code_generated_at: now.toISOString(),
                    pairing_code_expires_at: expiresAt.toISOString(),
                    // Increment attempts safely (need to fetch first or just set to 1 if we don't care about precise increment now)
                    // Let's just set proper timestamps for now.
                })
                .eq("id", usuarioId);
        } else if (result.instance?.state === "open" || result.instance?.state === "connected") {
             // Se já estiver conectado, atualiza o banco para refletir isso imediatamente
             await supabaseAdmin.from("usuarios")
                .update({ whatsapp_status: WHATSAPP_STATUS.CONNECTED })
                .eq("id", usuarioId);
        }

        return reply.send(result);
    } catch (err: any) {
          return reply.status(500).send({ error: err.message });
    }
  },

  disconnect: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        const authUid = (request as any).user?.id;
        logger.info({ authUid }, "WhatsappController.disconnect - Request received");
        if (!authUid) return reply.status(401).send({ error: "Não autorizado." });

        const { id: usuarioId } = await getUsuarioId(authUid);
        if (!usuarioId) return reply.status(404).send({ error: "Perfil não encontrado." });

        const instanceName = whatsappService.getInstanceName(usuarioId);

        await whatsappService.disconnectInstance(instanceName);
        
        // Atualizar DB
        await supabaseAdmin.from("usuarios")
            .update({ whatsapp_status: WHATSAPP_STATUS.DISCONNECTED })
            .eq("id", usuarioId);

        return reply.send({ success: true });
    } catch (err: any) {
        return reply.status(500).send({ error: err.message });
    }
  }
};
