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

    async logNotification(usuarioId: string, tipo: string, cicloRef: string): Promise<void> {
        await supabaseAdmin
            .from("assinatura_notificacoes")
            .insert({ usuario_id: usuarioId, tipo, ciclo_referencia: cicloRef })
            .throwOnError();
    }
};
