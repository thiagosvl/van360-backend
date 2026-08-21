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
        parcelas?: number;
        valor_parcela?: number;
        valor_total?: number;
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

    async getInvoicesByUserId(userId: string, page?: number, limit?: number) {
        let query = supabaseAdmin
            .from("assinatura_faturas")
            .select("*, assinaturas(*), planos(*)", { count: "exact" })
            .eq("usuario_id", userId)
            .neq("status", SubscriptionInvoiceStatus.CANCELED)
            .order("created_at", { ascending: false });

        if (page && limit) {
            const from = (page - 1) * limit;
            const to = from + limit - 1;
            query = query.range(from, to);
        }

        return query;
    },

    async cancelIncompleteInvoicesByUserId(userId: string, updated_at: string, excludeInvoiceId?: string) {
        let query = supabaseAdmin
            .from("assinatura_faturas")
            .update({
                status: SubscriptionInvoiceStatus.CANCELED,
                updated_at
            })
            .eq("usuario_id", userId)
            .in("status", [SubscriptionInvoiceStatus.PENDING, SubscriptionInvoiceStatus.FAILED]);

        if (excludeInvoiceId) {
            query = query.neq("id", excludeInvoiceId);
        }

        return query;
    }
};
