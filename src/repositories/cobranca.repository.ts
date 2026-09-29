import { supabaseAdmin } from "../config/supabase.js";
import { CobrancaStatus, STATUS_ASSINATURA_LIBERADA } from "../types/enums.js";
import { getLastDayOfMonth } from "../utils/date.utils.js";
import { isValidFilterValue } from "../utils/filter.utils.js";

const COBRANCA_PASSAGEIRO_SELECT = `
    nome, enviar_notificacoes,
    responsaveis:passageiro_responsaveis(
        tipo, parentesco,
        responsavel:responsaveis(id, nome, telefone, cpf, email)
    )
`;

export const cobrancaRepository = {
    async countByPassageiro(passageiroId: string) {
        return supabaseAdmin
            .from("cobrancas")
            .select("id", { count: "exact", head: true })
            .eq("passageiro_id", passageiroId);
    },

    async insert(data: Record<string, unknown>) {
        return supabaseAdmin
            .from("cobrancas")
            .insert([data])
            .select("*, passageiros(nome)")
            .single();
    },

    async update(id: string, data: Record<string, unknown>) {
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

    async getById(id: string, usuarioId?: string) {
        let query = supabaseAdmin
            .from("cobrancas")
            .select(`
                *,
                passageiro:passageiros (${COBRANCA_PASSAGEIRO_SELECT})
            `)
            .eq("id", id);

        if (isValidFilterValue(usuarioId)) {
            query = query.eq("usuario_id", usuarioId);
        }

        return query.single();
    },

    async getByIdBasic(id: string, usuarioId?: string) {
        let query = supabaseAdmin
            .from("cobrancas")
            .select("*, passageiros(nome)")
            .eq("id", id);

        if (isValidFilterValue(usuarioId)) {
            query = query.eq("usuario_id", usuarioId);
        }

        return query.single();
    },

    async getByIdWithPassageiroAndMotorista(id: string, usuarioId?: string) {
        let query = supabaseAdmin
            .from("cobrancas")
            .select(`
                *,
                passageiro:passageiros (${COBRANCA_PASSAGEIRO_SELECT}),
                motorista:usuarios (nome, apelido, razao_social, cpfcnpj, logo_url)
            `)
            .eq("id", id);

        if (isValidFilterValue(usuarioId)) {
            query = query.eq("usuario_id", usuarioId);
        }

        return query.single();
    },

    async listWithFilters(filtros: { usuarioId?: string; veiculoId?: string; passageiroId?: string; status?: string; dataInicio?: string; dataFim?: string; mes?: number | string; ano?: number | string; ano_letivo?: number | string; search?: string }) {
        let query = supabaseAdmin
            .from("cobrancas")
            .select(`*, passageiro:passageiros!inner(${COBRANCA_PASSAGEIRO_SELECT})`)
            .order("data_vencimento", { ascending: false });

        if (isValidFilterValue(filtros.usuarioId)) query = query.eq("usuario_id", filtros.usuarioId);
        if (isValidFilterValue(filtros.veiculoId)) query = query.eq("passageiros.veiculo_id", filtros.veiculoId);
        if (isValidFilterValue(filtros.passageiroId)) query = query.eq("passageiro_id", filtros.passageiroId);
        if (isValidFilterValue(filtros.status)) query = query.eq("status", filtros.status);
        if (isValidFilterValue(filtros.ano_letivo)) query = query.eq("ano_letivo", Number(filtros.ano_letivo));
        if (isValidFilterValue(filtros.dataInicio)) query = query.gte("data_vencimento", filtros.dataInicio);
        if (isValidFilterValue(filtros.dataFim)) query = query.lte("data_vencimento", filtros.dataFim);

        if (filtros.mes && filtros.ano) {
            const startStr = `${filtros.ano}-${String(filtros.mes).padStart(2, '0')}-01`;
            const lastDay = getLastDayOfMonth(Number(filtros.ano), Number(filtros.mes));
            const endStr = `${filtros.ano}-${String(filtros.mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

            query = query.gte("data_vencimento", startStr);
            query = query.lte("data_vencimento", endStr);
        }

        if (isValidFilterValue(filtros.search)) {
            query = query.or(`nome.ilike.%${filtros.search}%`, { foreignTable: 'passageiro' });
        }

        return query;
    },

    async listByPassageiro(passageiroId: string, ano?: string) {
        let query = supabaseAdmin
            .from("cobrancas")
            .select(`*, passageiro:passageiros!inner(${COBRANCA_PASSAGEIRO_SELECT})`)
            .eq("passageiro_id", passageiroId)
            .order("data_vencimento", { ascending: false });

        if (isValidFilterValue(ano)) {
            const anoInt = parseInt(ano);
            query = query.or(`ano.eq.${anoInt},ano_letivo.eq.${anoInt}`);
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

    async getByPassageiroMesAno(passageiroId: string, mes: number, ano: number) {
        return supabaseAdmin
            .from("cobrancas")
            .select(`*, passageiro:passageiros(${COBRANCA_PASSAGEIRO_SELECT})`)
            .eq("passageiro_id", passageiroId)
            .eq("mes", mes)
            .eq("ano", ano)
            .maybeSingle();
    },

    async getByMesAnoParaMotorista(usuarioId: string, mes: number, ano: number) {
        return supabaseAdmin
            .from("cobrancas")
            .select("passageiro_id")
            .eq("usuario_id", usuarioId)
            .eq("mes", mes)
            .eq("ano", ano);
    },

    async getPendentesParaNotificacao(datasVencimento: string[]) {
        return supabaseAdmin
            .from("cobrancas")
            .select(`
                *,
                passageiro:passageiros(${COBRANCA_PASSAGEIRO_SELECT}),
                motorista:usuarios!cobrancas_usuario_id_fkey!inner(
                    nome, apelido, telefone, chave_pix, tipo_chave_pix,
                    assinaturas!inner(status),
                    usuario_configuracoes!inner(
                        notificar_pais_cobrancas,
                        cobranca_aviso_previo_ativo,
                        cobranca_aviso_previo_whatsapp_ativo,
                        cobranca_dias_aviso_previo,
                        cobranca_vencimento_hoje_ativo,
                        cobranca_atraso_3_dias_ativo,
                        cobranca_atraso_5_dias_ativo,
                        cobranca_atraso_7_dias_ativo
                    )
                )
            `)
            .eq("status", CobrancaStatus.PENDENTE)
            .in("motorista.assinaturas.status", STATUS_ASSINATURA_LIBERADA)
            .eq("motorista.usuario_configuracoes.notificar_pais_cobrancas", true)
            .in("data_vencimento", datasVencimento);
    },

    async updateUltimaNotificacao(id: string, dataISO: string) {
        return supabaseAdmin
            .from("cobrancas")
            .update({ data_envio_ultima_notificacao: dataISO })
            .eq("id", id);
    },

    async updateBulkUltimaNotificacao(ids: string[], dataISO: string) {
        if (ids.length === 0) return { data: null, error: null };
        return supabaseAdmin
            .from("cobrancas")
            .update({ data_envio_ultima_notificacao: dataISO })
            .in("id", ids);
    },

    async registrarPagamentoManual(id: string, data: Record<string, unknown>) {
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

    async getForPeriodForDashboard(usuarioId: string, start: string, end: string, veiculoId?: string) {
        const hasVeiculo = isValidFilterValue(veiculoId);
        let query = supabaseAdmin
            .from("cobrancas")
            .select(hasVeiculo ? "id, status, valor, valor_pago, passageiro_id, data_vencimento, passageiro:passageiros!inner(veiculo_id)" : "id, status, valor, valor_pago, passageiro_id, data_vencimento")
            .eq("usuario_id", usuarioId)
            .gte("data_vencimento", start)
            .lte("data_vencimento", end);
        if (hasVeiculo) {
            query = query.eq("passageiros.veiculo_id", veiculoId);
        }

        return query;
    },

    async getCobrancasPendentesPorPeriodo(usuarioId: string, start: string, end: string) {
        return supabaseAdmin
            .from("cobrancas")
            .select(`
                *,
                passageiro:passageiros(${COBRANCA_PASSAGEIRO_SELECT})
            `)
            .eq("usuario_id", usuarioId)
            .eq("status", CobrancaStatus.PENDENTE)
            .gte("data_vencimento", start)
            .lte("data_vencimento", end)
            .order("data_vencimento", { ascending: true });
    },

    async getByPassageiroEAno(passageiroId: string, ano: number) {
        return supabaseAdmin
            .from("cobrancas")
            .select("id, mes, ano, valor, valor_pago, status, data_vencimento, data_pagamento")
            .eq("passageiro_id", passageiroId)
            .eq("ano", ano)
            .neq("status", CobrancaStatus.CANCELADA)
            .order("mes", { ascending: true });
    },

    async getPendentesVencendoHojeParaMotoristas(hojeStr: string, usuarioIdOuIds?: string | string[]) {
        if (Array.isArray(usuarioIdOuIds) && usuarioIdOuIds.length === 0) {
            return { data: [], error: null };
        }

        const SELECT_FIELDS = `
            id,
            valor,
            data_vencimento,
            status,
            usuario_id,
            passageiro:passageiros(
                nome,
                genero,
                responsaveis:passageiro_responsaveis(
                    tipo,
                    responsavel:responsaveis(nome)
                )
            )
        `;

        if (Array.isArray(usuarioIdOuIds)) {
            const BATCH_SIZE = 100;
            const cobrancasTotais: Array<{
                id: string;
                valor: number | string | null;
                data_vencimento: string;
                status: string;
                usuario_id: string;
                passageiro: unknown;
            }> = [];

            for (let i = 0; i < usuarioIdOuIds.length; i += BATCH_SIZE) {
                const chunk = usuarioIdOuIds.slice(i, i + BATCH_SIZE);
                const { data, error } = await supabaseAdmin
                    .from("cobrancas")
                    .select(SELECT_FIELDS)
                    .eq("status", CobrancaStatus.PENDENTE)
                    .eq("data_vencimento", hojeStr)
                    .in("usuario_id", chunk);

                if (error) {
                    return { data: null, error };
                }

                if (data) {
                    cobrancasTotais.push(...(data as unknown as typeof cobrancasTotais));
                }
            }

            return { data: cobrancasTotais, error: null };
        }

        let query = supabaseAdmin
            .from("cobrancas")
            .select(SELECT_FIELDS)
            .eq("status", CobrancaStatus.PENDENTE)
            .eq("data_vencimento", hojeStr);

        if (usuarioIdOuIds) {
            query = query.eq("usuario_id", usuarioIdOuIds);
        }

        return query;
    }
};
