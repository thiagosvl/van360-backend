import { supabaseAdmin } from "../config/supabase.js";
import { SubscriptionInvoiceStatus } from "../types/enums.js";

export const invoiceRepository = {
    async createInvoice(data: {
        usuario_id: string;
        assinatura_id: string;
        plano_id: string;
        metodo_pagamento: string;
        valor: number;
        status: SubscriptionInvoiceStatus;
        data_vencimento: string;
        gateway_txid?: string;
        pix_copy_paste?: string;
    }) {
        return supabaseAdmin
            .from("assinatura_faturas")
            .insert(data)
            .select()
            .single();
    },

    async updateInvoiceStatus(id: string, status: SubscriptionInvoiceStatus) {
        return supabaseAdmin
            .from("assinatura_faturas")
            .update({ status })
            .eq("id", id);
    },

    async getInvoiceByGatewayTxId(txid: string) {
        return supabaseAdmin
            .from("assinatura_faturas")
            .select("id, status, usuario_id, assinatura_id")
            .eq("gateway_txid", txid)
            .maybeSingle();
    },

    async getInvoicesByUserId(userId: string) {
        return supabaseAdmin
            .from("assinatura_faturas")
            .select("*, assinaturas(*), planos(*)")
            .eq("usuario_id", userId)
            .order("created_at", { ascending: false });
    },

    async cancelPendingInvoicesByUserId(userId: string, updated_at: string) {
        return supabaseAdmin
            .from("assinatura_faturas")
            .update({
                status: SubscriptionInvoiceStatus.CANCELED,
                updated_at
            })
            .eq("usuario_id", userId)
            .eq("status", SubscriptionInvoiceStatus.PENDING);
    }
};
