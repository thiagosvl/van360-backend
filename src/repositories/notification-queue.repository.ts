import { supabaseAdmin } from "../config/supabase.js";
import { NotificationChannelEnum, NotificationQueueStatus } from "../types/enums.js";

export interface NotificationQueueItemPayload {
    id?: string;
    usuario_id?: string | null;
    canal: NotificationChannelEnum;
    evento: string;
    destinatario: string;
    status?: NotificationQueueStatus;
    tentativas?: number;
    max_tentativas?: number;
    proxima_tentativa_em?: string;
    payload: Record<string, unknown>;
    erro_mensagem?: string | null;
    provider_message_id?: string | null;
    created_at?: string;
    updated_at?: string;
}

export const notificationQueueRepository = {
    async create(item: Omit<NotificationQueueItemPayload, "id" | "created_at" | "updated_at">): Promise<NotificationQueueItemPayload> {
        const { data, error } = await supabaseAdmin
            .from("fila_notificacoes")
            .insert({
                usuario_id: item.usuario_id || null,
                canal: item.canal,
                evento: item.evento,
                destinatario: item.destinatario,
                status: item.status || NotificationQueueStatus.PENDING,
                tentativas: item.tentativas || 0,
                max_tentativas: item.max_tentativas || 3,
                proxima_tentativa_em: item.proxima_tentativa_em || new Date().toISOString(),
                payload: item.payload,
                erro_mensagem: item.erro_mensagem || null,
                provider_message_id: item.provider_message_id || null
            })
            .select()
            .single();

        if (error) throw error;
        return data as NotificationQueueItemPayload;
    },

    async createBulk(items: Array<Omit<NotificationQueueItemPayload, "id" | "created_at" | "updated_at">>): Promise<void> {
        if (items.length === 0) return;

        const records = items.map(item => ({
            usuario_id: item.usuario_id || null,
            canal: item.canal,
            evento: item.evento,
            destinatario: item.destinatario,
            status: item.status || NotificationQueueStatus.PENDING,
            tentativas: item.tentativas || 0,
            max_tentativas: item.max_tentativas || 3,
            proxima_tentativa_em: item.proxima_tentativa_em || new Date().toISOString(),
            payload: item.payload,
            erro_mensagem: item.erro_mensagem || null,
            provider_message_id: item.provider_message_id || null
        }));

        const { error } = await supabaseAdmin
            .from("fila_notificacoes")
            .insert(records);

        if (error) throw error;
    },

    async findPendingRetryItems(limit = 20): Promise<NotificationQueueItemPayload[]> {
        const nowIso = new Date().toISOString();
        const { data, error } = await supabaseAdmin
            .from("fila_notificacoes")
            .select("*")
            .in("status", [NotificationQueueStatus.PENDING, NotificationQueueStatus.RETRY_PENDING])
            .lte("proxima_tentativa_em", nowIso)
            .order("proxima_tentativa_em", { ascending: true })
            .limit(limit);

        if (error) throw error;
        return (data || []) as NotificationQueueItemPayload[];
    },

    async markAsProcessing(id: string): Promise<boolean> {
        const { data, error } = await supabaseAdmin
            .from("fila_notificacoes")
            .update({
                status: NotificationQueueStatus.PROCESSING,
                updated_at: new Date().toISOString()
            })
            .eq("id", id)
            .in("status", [NotificationQueueStatus.PENDING, NotificationQueueStatus.RETRY_PENDING])
            .select("id");

        if (error || !data || data.length === 0) return false;
        return true;
    },

    async markAsSent(id: string, providerMessageId?: string): Promise<void> {
        const updatePayload: Record<string, unknown> = {
            status: NotificationQueueStatus.SENT,
            erro_mensagem: null,
            updated_at: new Date().toISOString()
        };

        if (providerMessageId) {
            updatePayload.provider_message_id = providerMessageId;
        }

        await supabaseAdmin
            .from("fila_notificacoes")
            .update(updatePayload)
            .eq("id", id);
    },

    async findByProviderMessageId(providerMessageId: string): Promise<NotificationQueueItemPayload | null> {
        const { data, error } = await supabaseAdmin
            .from("fila_notificacoes")
            .select("*")
            .eq("provider_message_id", providerMessageId)
            .maybeSingle();

        if (error) return null;
        return data as NotificationQueueItemPayload | null;
    },

    async markAsWebhookFailed(providerMessageId: string, erroMensagem: string): Promise<boolean> {
        const { data, error } = await supabaseAdmin
            .from("fila_notificacoes")
            .update({
                status: NotificationQueueStatus.FAILED,
                erro_mensagem: erroMensagem,
                updated_at: new Date().toISOString()
            })
            .eq("provider_message_id", providerMessageId)
            .select("id");

        if (error || !data || data.length === 0) return false;
        return true;
    },

    async touchUpdatedTimestampByProviderMessageId(providerMessageId: string): Promise<boolean> {
        const { data, error } = await supabaseAdmin
            .from("fila_notificacoes")
            .update({
                updated_at: new Date().toISOString()
            })
            .eq("provider_message_id", providerMessageId)
            .select("id");

        if (error || !data || data.length === 0) return false;
        return true;
    },

    async markAsRetryPending(id: string, tentativas: number, proximaTentativaEm: string, erroMensagem: string): Promise<void> {
        await supabaseAdmin
            .from("fila_notificacoes")
            .update({
                status: NotificationQueueStatus.RETRY_PENDING,
                tentativas,
                proxima_tentativa_em: proximaTentativaEm,
                erro_mensagem: erroMensagem,
                updated_at: new Date().toISOString()
            })
            .eq("id", id);
    },

    async markAsFailed(id: string, tentativas: number, erroMensagem: string): Promise<void> {
        await supabaseAdmin
            .from("fila_notificacoes")
            .update({
                status: NotificationQueueStatus.FAILED,
                tentativas,
                erro_mensagem: erroMensagem,
                updated_at: new Date().toISOString()
            })
            .eq("id", id);
    },

    async markAsCancelled(id: string, motivo: string): Promise<void> {
        await supabaseAdmin
            .from("fila_notificacoes")
            .update({
                status: NotificationQueueStatus.CANCELLED,
                erro_mensagem: motivo,
                updated_at: new Date().toISOString()
            })
            .eq("id", id);
    },

    async purgeOldSentNotifications(daysOlderThan = 30): Promise<number> {
        const cutoffDate = new Date(Date.now() - daysOlderThan * 24 * 60 * 60 * 1000).toISOString();

        const { data, error } = await supabaseAdmin
            .from("fila_notificacoes")
            .delete()
            .eq("status", NotificationQueueStatus.SENT)
            .lte("created_at", cutoffDate)
            .select("id");

        if (error) throw error;
        return data ? data.length : 0;
    }
};
