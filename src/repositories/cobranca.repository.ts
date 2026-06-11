import { supabaseAdmin } from "../config/supabase.js";
import { CobrancaStatus } from "../types/enums.js";
import { getLastDayOfMonth } from "../utils/date.utils.js";

export const cobrancaRepository = {
    async countByPassageiro(passageiroId: string) {
        return supabaseAdmin
            .from("cobrancas")
            .select("id", { count: "exact", head: true })
            .eq("passageiro_id", passageiroId);
    },

    async insert(data: any) {
        return supabaseAdmin
            .from("cobrancas")
            .insert([data])
            .select("*, passageiros(nome)")
            .single();
    },

    async update(id: string, data: any) {
        return supabaseAdmin
            .from("cobrancas")
            .update(data)
            .eq("id", id)
            .select()
            .single();
    },

    async delete(id: string) {
        return supabaseAdmin.from("cobrancas").delete().eq("id", id);
    },

    async getById(id: string) {
        return supabaseAdmin
            .from("cobrancas")
            .select("*, passageiro:passageiros(*, escola:escolas(nome), veiculo:veiculos(placa))")
            .eq("id", id)
            .single();
    },

    async getByIdBasic(id: string) {
        return supabaseAdmin
            .from("cobrancas")
            .select("*, passageiros(nome)")
            .eq("id", id)
            .single();
    },

    async getByIdWithPassageiroAndMotorista(id: string) {
        return supabaseAdmin
            .from("cobrancas")
            .select(`
                *,
                passageiro:passageiros (nome, nome_responsavel, cpf_responsavel),
                motorista:usuarios (nome, apelido)
            `)
            .eq("id", id)
            .single();
    },

    async listWithFilters(filtros: any) {
        let query = supabaseAdmin
            .from("cobrancas")
            .select("*, passageiro:passageiros!inner(nome, nome_responsavel, telefone_responsavel)")
            .order("data_vencimento", { ascending: false });

        if (filtros.usuarioId) query = query.eq("usuario_id", filtros.usuarioId);
        if (filtros.passageiroId) query = query.eq("passageiro_id", filtros.passageiroId);
        if (filtros.status) query = query.eq("status", filtros.status);
        if (filtros.dataInicio) query = query.gte("data_vencimento", filtros.dataInicio);
        if (filtros.dataFim) query = query.lte("data_vencimento", filtros.dataFim);

        if (filtros.mes && filtros.ano) {
            const startStr = `${filtros.ano}-${String(filtros.mes).padStart(2, '0')}-01`;
            const lastDay = getLastDayOfMonth(Number(filtros.ano), Number(filtros.mes));
            const endStr = `${filtros.ano}-${String(filtros.mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

            query = query.gte("data_vencimento", startStr);
            query = query.lte("data_vencimento", endStr);
        }

        if (filtros.search) {
            query = query.or(`nome.ilike.%${filtros.search}%,nome_responsavel.ilike.%${filtros.search}%`, { foreignTable: 'passageiro' });
        }

        return query;
    },

    async listByPassageiro(passageiroId: string, ano?: string) {
        let query = supabaseAdmin
            .from("cobrancas")
            .select("*, passageiro:passageiros!inner(nome, nome_responsavel, telefone_responsavel)")
            .eq("passageiro_id", passageiroId)
            .order("data_vencimento", { ascending: false });

        if (ano) {
            query = query.eq("ano", parseInt(ano));
        }

        return query;
    },

    async toggleNotificacoes(id: string, desativar_lembretes: boolean) {
        return supabaseAdmin
            .from("cobrancas")
            .update({ desativar_lembretes })
            .eq("id", id)
            .select("desativar_lembretes, usuario_id")
            .single();
    },

    async countForMesAnoPassageiro(passageiroId: string, mes: number, ano: number) {
        return supabaseAdmin
            .from("cobrancas")
            .select("id", { count: "exact", head: true })
            .eq("passageiro_id", passageiroId)
            .eq("mes", mes)
            .eq("ano", ano);
    },

    async getPendentesParaNotificacao() {
        return supabaseAdmin
            .from("cobrancas")
            .select(`
                *,
                passageiro:passageiros(nome, nome_responsavel, telefone_responsavel, enviar_notificacoes),
                motorista:usuarios!cobrancas_usuario_id_fkey(nome, apelido, telefone, chave_pix, tipo_chave_pix)
            `)
            .eq("status", CobrancaStatus.PENDENTE)
            .eq("desativar_lembretes", false);
    },

    async updateUltimaNotificacao(id: string, dataIso: string) {
        return supabaseAdmin
            .from("cobrancas")
            .update({ data_envio_ultima_notificacao: dataIso })
            .eq("id", id);
    },

    async registrarPagamentoManual(id: string, data: any) {
        return supabaseAdmin
            .from("cobrancas")
            .update(data)
            .eq("id", id)
            .select()
            .single();
    },

    async desfazerPagamento(id: string) {
        return supabaseAdmin
            .from("cobrancas")
            .update({
                status: CobrancaStatus.PENDENTE,
                data_pagamento: null,
                valor_pago: null,
                tipo_pagamento: null,
                pagamento_manual: false,
                recibo_url: null,
            })
            .eq("id", id)
            .select()
            .single();
    },

    async getForPeriodForDashboard(usuarioId: string, start: string, end: string) {
        return supabaseAdmin
            .from("cobrancas")
            .select("*")
            .eq("usuario_id", usuarioId)
            .gte("data_vencimento", start)
            .lte("data_vencimento", end);
    }
};
