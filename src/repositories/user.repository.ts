import { supabaseAdmin } from "../config/supabase.js";
import { SubscriptionStatus, STATUS_ASSINATURA_LIBERADA } from "../types/enums.js";

export const userRepository = {
    async getById(id: string) {
        return supabaseAdmin
            .from("usuarios")
            .select("*")
            .eq("id", id)
            .single();
    },

    async getByPhoneExcludingId(phone: string, excludeId: string) {
        return supabaseAdmin
            .from("usuarios")
            .select("id")
            .eq("telefone", phone)
            .neq("id", excludeId)
            .maybeSingle();
    },

    async getProfileData(id: string) {
        return supabaseAdmin
            .from("usuarios")
            .select("id, nome, cpfcnpj, telefone, config_contrato, chave_pix, tipo_chave_pix, data_nascimento, logradouro, numero, bairro, cidade, estado, cep, canal_aquisicao")
            .eq("id", id)
            .single();
    },

    async update(id: string, updates: any) {
        return supabaseAdmin
            .from("usuarios")
            .update(updates)
            .eq("id", id);
    },

    async getPixKey(id: string) {
        return supabaseAdmin
            .from("usuarios")
            .select("chave_pix")
            .eq("id", id)
            .single();
    },

    async getMotoristaId(id: string) {
        return supabaseAdmin
            .from("usuarios")
            .select("id")
            .eq("id", id)
            .single();
    },

    async listMotoristasAtivos() {
        // Usa !inner para garantir que só retorna usuários que possuem uma assinatura válida (não expirada/cancelada)
        const { data, error } = await supabaseAdmin
            .from("usuarios")
            .select(`
                id, 
                telefone, 
                nome,
                assinaturas!inner(status)
            `)
            .eq("ativo", true)
            .eq("tipo", "motorista")
            .in("assinaturas.status", STATUS_ASSINATURA_LIBERADA);

        if (error) {
            throw error;
        }

        return { data, error: null };
    },


    async getByEmail(email: string) {
        return supabaseAdmin
            .from("usuarios")
            .select("id")
            .eq("email", email)
            .maybeSingle();
    },

    async getByCpfcnpj(cpfcnpj: string) {
        return supabaseAdmin
            .from("usuarios")
            .select("id")
            .eq("cpfcnpj", cpfcnpj)
            .maybeSingle();
    },

    async insert(data: any) {
        return supabaseAdmin
            .from("usuarios")
            .insert([data]);
    },

    async delete(id: string) {
        return supabaseAdmin
            .from("usuarios")
            .delete()
            .eq("id", id);
    },

    async getPublicData(id: string) {
        return supabaseAdmin
            .from("usuarios")
            .select("id, nome, apelido")
            .eq("id", id)
            .single();
    }
};
