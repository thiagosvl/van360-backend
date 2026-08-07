import { supabaseAdmin } from "../config/supabase.js";
import { STATUS_ASSINATURA_LIBERADA, UserType } from "../types/enums.js";

export const userRepository = {
    async getById(id: string) {
        return supabaseAdmin
            .from("usuarios")
            .select("*")
            .eq("id", id)
            .single();
    },

    async getByPhone(phone: string) {
        return supabaseAdmin
            .from("usuarios")
            .select("id")
            .eq("telefone", phone)
            .maybeSingle();
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
            .select("id, nome, razao_social, cpfcnpj, telefone, tipo, conta_pai_id, veiculo_id, config_contrato, chave_pix, tipo_chave_pix, data_nascimento, logradouro, numero, bairro, cidade, estado, cep, canal_aquisicao, dispositivo_cadastro, metadados_cadastro, created_at, veiculos:veiculo_id(id, modelo, placa, marca)")
            .eq("id", id)
            .single();
    },

    async update(id: string, updates: Record<string, unknown>) {
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
                usuario_configuracoes(notificar_motorista_aniversarios, notificar_motorista_parcelas),
                assinaturas!inner(status)
            `)
            .eq("ativo", true)
            .eq("tipo", UserType.MOTORISTA)
            .in("assinaturas.status", STATUS_ASSINATURA_LIBERADA);

        if (error) {
            throw error;
        }

        return { data, error: null };
    },

    async listMotoristasAtivosParaAniversario() {
        const { data, error } = await supabaseAdmin
            .from("usuarios")
            .select(`
                id, 
                telefone, 
                nome,
                assinaturas!inner(status),
                usuario_configuracoes!inner(notificar_motorista_aniversarios)
            `)
            .eq("ativo", true)
            .eq("tipo", UserType.MOTORISTA)
            .in("assinaturas.status", STATUS_ASSINATURA_LIBERADA)
            .eq("usuario_configuracoes.notificar_motorista_aniversarios", true);

        if (error) {
            throw error;
        }

        return { data, error: null };
    },

    async listMotoristasAtivosParaResumoCobranca() {
        const { data, error } = await supabaseAdmin
            .from("usuarios")
            .select(`
                id, 
                telefone, 
                nome,
                assinaturas!inner(status),
                usuario_configuracoes!inner(notificar_motorista_parcelas)
            `)
            .eq("ativo", true)
            .eq("tipo", UserType.MOTORISTA)
            .in("assinaturas.status", STATUS_ASSINATURA_LIBERADA)
            .eq("usuario_configuracoes.notificar_motorista_parcelas", true);

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

    async insert(data: Record<string, unknown>) {
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
