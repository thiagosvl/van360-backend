import { supabaseAdmin } from "../config/supabase.js";

export const notificationRepository = {
    async hasNotified(usuarioId: string, tipo: string, cicloRef: string): Promise<boolean> {
        const { data } = await supabaseAdmin
            .from("assinatura_notificacoes")
            .select("id")
            .eq("usuario_id", usuarioId)
            .eq("tipo", tipo)
            .eq("ciclo_referencia", cicloRef)
            .maybeSingle();
        return !!data;
    },

    async getNotificationsForUsers(userIds: string[], tipos: string[]) {
        if (userIds.length === 0 || tipos.length === 0) return { data: [] };
        return supabaseAdmin
            .from("assinatura_notificacoes")
            .select("usuario_id, tipo, ciclo_referencia")
            .in("usuario_id", userIds)
            .in("tipo", tipos);
    },

    async logNotification(usuarioId: string, tipo: string, cicloRef: string): Promise<void> {
        await supabaseAdmin
            .from("assinatura_notificacoes")
            .insert({ usuario_id: usuarioId, tipo, ciclo_referencia: cicloRef })
            .throwOnError();
    },

    async logNotificationsBulk(dataArray: { usuario_id: string, tipo: string, ciclo_referencia: string }[]): Promise<void> {
        if (dataArray.length === 0) return;
        await supabaseAdmin
            .from("assinatura_notificacoes")
            .insert(dataArray)
            .throwOnError();
    }
};
