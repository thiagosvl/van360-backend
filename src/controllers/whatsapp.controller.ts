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
        logger.info({ authUid }, "WhatsappController.connect - Request received");
        if (!authUid) return reply.status(401).send({ error: "Não autorizado." });

        const { id: usuarioId } = await getUsuarioId(authUid);
        if (!usuarioId) return reply.status(404).send({ error: "Perfil não encontrado." });

        const instanceName = whatsappService.getInstanceName(usuarioId);

        const result: ConnectInstanceResponse = await whatsappService.connectInstance(instanceName);
        
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

        const result: ConnectInstanceResponse = await whatsappService.requestPairingCode(instanceName, telefone);
        
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
