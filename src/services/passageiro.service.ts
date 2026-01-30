import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import { automationService } from "./automation.service.js";
import { subscriptionLifecycleService } from "./subscription-lifecycle.service.js";

import { CreatePassageiroDTO, ListPassageirosFiltersDTO, UpdatePassageiroDTO } from "../types/dtos/passageiro.dto.js";
import { ContratoProvider, ContratoStatus, PassageiroDesativacaoCobrancaAutomaticaMotivo } from "../types/enums.js";
import { moneyToNumber } from "../utils/currency.utils.js";
import { cleanString, onlyDigits } from "../utils/string.utils.js";

// Métodos privados auxiliares
const _preparePassageiroData = (data: Partial<CreatePassageiroDTO> & Record<string, any>, usuarioId?: string, isUpdate: boolean = false): any => {
    const prepared: any = {};

    if (!isUpdate && usuarioId) {
        prepared.usuario_id = usuarioId;
        prepared.ativo = true; // Default registration active
    }

    if (data.nome) prepared.nome = cleanString(data.nome, true);
    
    // Tratamento de Foreign Keys (permite null ou undefined)
    if (data.escola_id !== undefined) prepared.escola_id = (data.escola_id === "none" || data.escola_id === "") ? null : data.escola_id;
    if (data.veiculo_id !== undefined) prepared.veiculo_id = (data.veiculo_id === "none" || data.veiculo_id === "") ? null : data.veiculo_id;
    
    // Campos Opcionais
    if (data.nome_responsavel !== undefined) prepared.nome_responsavel = data.nome_responsavel ? cleanString(data.nome_responsavel, true) : null;
    if (data.cpf_responsavel !== undefined) prepared.cpf_responsavel = data.cpf_responsavel ? onlyDigits(data.cpf_responsavel) : null;
    if (data.telefone_responsavel !== undefined) prepared.telefone_responsavel = data.telefone_responsavel ? onlyDigits(data.telefone_responsavel) : null;
    if (data.email_responsavel !== undefined) prepared.email_responsavel = data.email_responsavel ? cleanString(data.email_responsavel) : null;
    
    // Endereço
    if (data.logradouro !== undefined) prepared.logradouro = data.logradouro ? cleanString(data.logradouro, true) : null;
    if (data.numero !== undefined) prepared.numero = data.numero ? cleanString(data.numero, true) : null;
    if (data.bairro !== undefined) prepared.bairro = data.bairro ? cleanString(data.bairro, true) : null;
    if (data.cidade !== undefined) prepared.cidade = data.cidade ? cleanString(data.cidade, true) : null;
    if (data.estado !== undefined) prepared.estado = data.estado ? cleanString(data.estado, true) : null;
    if (data.cep !== undefined) prepared.cep = data.cep ? onlyDigits(data.cep) : null;
    if (data.referencia !== undefined) prepared.referencia = data.referencia ? cleanString(data.referencia, true) : null;
    if (data.observacoes !== undefined) prepared.observacoes = data.observacoes ? cleanString(data.observacoes, true) : null;
    
    // Detalhes
    if (data.periodo !== undefined) prepared.periodo = data.periodo ? cleanString(data.periodo.toLocaleLowerCase()) : null;
    if (data.genero !== undefined) prepared.genero = data.genero ? cleanString(data.genero) : null;
    if (data.valor_cobranca !== undefined) prepared.valor_cobranca = typeof data.valor_cobranca === "string" ? moneyToNumber(data.valor_cobranca) : (data.valor_cobranca || 0);
    if (data.dia_vencimento !== undefined) prepared.dia_vencimento = data.dia_vencimento;
    
    // Novos Campos
    if (data.modalidade !== undefined) prepared.modalidade = data.modalidade;
    if (data.data_nascimento !== undefined) prepared.data_nascimento = data.data_nascimento;
    if (data.parentesco_responsavel !== undefined) prepared.parentesco_responsavel = data.parentesco_responsavel;
    if (data.data_inicio_transporte !== undefined) prepared.data_inicio_transporte = data.data_inicio_transporte;
    
    
    // Controle
    if (data.ativo !== undefined) prepared.ativo = data.ativo;
    if (data.enviar_cobranca_automatica !== undefined) prepared.enviar_cobranca_automatica = !!data.enviar_cobranca_automatica;
    
    return prepared;
};

const createPassageiro = async (data: CreatePassageiroDTO): Promise<any> => {
    if (!data.usuario_id) throw new Error("Usuário obrigatório");
    if (!data.nome) throw new Error("Nome do passageiro é obrigatório");

    // 1. Limites do Plano (Feature Gating)
    // Validar limites se Cobrança Automática estiver ativada
    if (data.enviar_cobranca_automatica) {
        try {
            await subscriptionLifecycleService.verificarLimiteAutomacao(data.usuario_id, 1);
        } catch (error: any) {
             // Traduzir erro ou repassar
             if (error.message.includes("LIMIT_EXCEEDED")) {
                 throw new AppError("Limite de passageiros com cobrança automática excedido para seu plano.", 403);
             }
             throw error;
        }
    }

    const passageiroData = _preparePassageiroData(data, data.usuario_id, false);

    const { data: inserted, error } = await supabaseAdmin
        .from("passageiros")
        .insert([passageiroData])
        .select()
        .single();

    if (error) throw error;
    
    // Safety Net: Verificar se precisa gerar cobrança do Mês Seguinte (Pós dia 25)
    if (inserted.enviar_cobranca_automatica) {
        try {
            // Roda em background (não await blocking crítico, mas aqui usamos await para garantir consistência em testes)
            await automationService.verificarGerarCobrancaMesSeguinte(inserted.id, inserted, inserted.usuario_id);
        } catch (err) {
             console.error("[createPassageiro] Falha na safety net de cobrança futura", err);
             // Não lançamos erro para não falhar o cadastro
        }
    }

    // 2. Trigger de Contrato Automático (Se Profissional e Configurado)
    // Buscamos configuração do usuário
    const { data: usuario } = await supabaseAdmin
        .from("usuarios")
        .select("config_contrato, auth_uid")
        .eq("id", data.usuario_id)
        .single();
    
    if (usuario?.config_contrato?.usar_contratos && usuario?.config_contrato?.configurado && usuario?.auth_uid) {
        try {
            // Import dinâmico ou garantir que contractService esteja no topo
            const { contractService } = await import("./contract.service.js");
            // Dispara criação (async sem await blocking total se quisermos performance, mas melhor garantir aqui)
            await contractService.criarContrato(usuario.auth_uid, {
                passageiroId: inserted.id,
                provider: ContratoProvider.INHOUSE
            });
        } catch (err) {
            console.error("[createPassageiro] Falha ao disparar contrato automático", err);
            // Não falha a criação do passageiro se o contrato der erro, apenas loga
        }
    }

    return inserted;
};

const updatePassageiro = async (id: string, data: UpdatePassageiroDTO): Promise<any> => {
    if (!id) throw new Error("ID do passageiro é obrigatório");

    // 1. Buscar estado ATUAL (antes do update) para comparações
    const estadoAnterior = await getPassageiro(id);
    if (!estadoAnterior) throw new AppError("Passageiro não encontrado", 404);

    const passageiroData = _preparePassageiroData(data, undefined, true);
    
    // Validar se pode ativar cobranças automáticas
    if (data.enviar_cobranca_automatica !== undefined) {
        // Se tentando ativar, validar se tem plano Profissional e Limites
        if (data.enviar_cobranca_automatica === true) {
            // Se o passageiro já estava marcado como automático E ativo, não conta como "+1" novo
            const isIncremento = !estadoAnterior.enviar_cobranca_automatica; // Se era false, vira true => +1

            if (isIncremento) {
                try {
                    await subscriptionLifecycleService.verificarLimiteAutomacao(estadoAnterior.usuario_id, 1);
                } catch (err: any) {
                     // Repassar erro de limite
                     throw new Error(err.message);
                }
            }
        }
        
        passageiroData.enviar_cobranca_automatica = data.enviar_cobranca_automatica;
        
        if (data.enviar_cobranca_automatica === false) {
            passageiroData.origem_desativacao_cobranca_automatica = PassageiroDesativacaoCobrancaAutomaticaMotivo.MANUAL;
        } else if (data.enviar_cobranca_automatica === true) {
            passageiroData.origem_desativacao_cobranca_automatica = null;
        }
    }

    const { data: updated, error } = await supabaseAdmin
        .from("passageiros")
        .update(passageiroData)
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;

    // Safety Net: Verificar se precisa gerar cobrança do Mês Seguinte (Pós dia 25) após ativação
    // Só executamos se a automação foi ATIVADA nesta transação (não estava ativa antes)
    const automacaoFoiAtivada = data.enviar_cobranca_automatica === true && estadoAnterior.enviar_cobranca_automatica !== true;
    
    if (automacaoFoiAtivada) {
        try {
            console.log("[updatePassageiro] Automação ativada tardiamente. Verificando geração mês seguinte...");
            await automationService.verificarGerarCobrancaMesSeguinte(updated.id, updated, updated.usuario_id);
        } catch (err) {
             console.error("[updatePassageiro] Falha na safety net de cobrança futura", err);
        }
    }

    // 2. Lógica de Substituição de Contrato
    // Helper simples para valor do DTO
    const getValorNumerico = (v: any) => typeof v === 'string' ? moneyToNumber(v) : v;

    const houveMudancaContratual = 
        (data.valor_cobranca !== undefined && Math.abs(getValorNumerico(data.valor_cobranca) - Number(estadoAnterior.valor_cobranca)) > 0.01) ||
        (data.dia_vencimento !== undefined && Number(data.dia_vencimento) !== Number(estadoAnterior.dia_vencimento)) ||
        (data.nome ? cleanString(data.nome, true) !== estadoAnterior.nome : false) ||
        (data.nome_responsavel ? cleanString(data.nome_responsavel, true) !== estadoAnterior.nome_responsavel : false) ||
        (data.parentesco_responsavel !== undefined && data.parentesco_responsavel !== estadoAnterior.parentesco_responsavel) ||
        (data.cpf_responsavel !== undefined && data.cpf_responsavel !== estadoAnterior.cpf_responsavel) ||
        (data.escola_id !== undefined && data.escola_id !== estadoAnterior.escola_id) ||
        (data.periodo !== undefined && data.periodo !== estadoAnterior.periodo) ||
        (data.modalidade !== undefined && data.modalidade !== estadoAnterior.modalidade) ||
        (data.data_inicio_transporte !== undefined && data.data_inicio_transporte !== estadoAnterior.data_inicio_transporte) ||
        (data.logradouro !== undefined && data.logradouro !== estadoAnterior.logradouro) ||
        (data.numero !== undefined && data.numero !== estadoAnterior.numero) ||
        (data.bairro !== undefined && data.bairro !== estadoAnterior.bairro) ||
        (data.cidade !== undefined && data.cidade !== estadoAnterior.cidade) ||
        (data.estado !== undefined && data.estado !== estadoAnterior.estado) ||
        (data.cep !== undefined && data.cep !== estadoAnterior.cep);

    if (houveMudancaContratual) {
        // Trigger de substituição
        const { data: usuario } = await supabaseAdmin
            .from("usuarios")
            .select("config_contrato, auth_uid")
            .eq("id", updated.usuario_id)
            .single();

        if (usuario?.config_contrato?.usar_contratos && usuario?.config_contrato?.configurado && usuario?.auth_uid) {
            try {
                const { contractService } = await import("./contract.service.js");
                
                console.log(`[updatePassageiro] Substituindo contrato passageiro ${id}. Mudanças detectadas.`);

                // Lógica de Histórico Limpo:
                // Se o último contrato ativo for PENDENTE (não assinado), excluímos ele (pois é "draft" irrelevante).
                // Se for ASSINADO, marcamos como substituído (histórico real).
                const { data: activeContracts } = await supabaseAdmin
                    .from("contratos")
                    .select("id, status")
                    .eq("passageiro_id", id)
                    .in("status", [ContratoStatus.PENDENTE, ContratoStatus.ASSINADO])
                    .order("created_at", { ascending: false });

                if (activeContracts && activeContracts.length > 0) {
                    const latest = activeContracts[0];

                    if (latest.status === ContratoStatus.PENDENTE) {
                        // Contrato pendente anterior é descartável
                        console.log(`[updatePassageiro] Removendo contrato pendente anterior (${latest.id}) para limpeza.`);
                        await supabaseAdmin.from("contratos").delete().eq("id", latest.id);

                        // Se existirem outros "sobrando" (ex: bug de múltiplos ativos), aposentamos eles
                        if (activeContracts.length > 1) {
                            const othersIds = activeContracts.slice(1).map(c => c.id);
                            await supabaseAdmin
                                .from("contratos")
                                .update({ status: ContratoStatus.SUBSTITUIDO })
                                .in("id", othersIds);
                        }
                    } else {
                        // Último era Assinado (Histórico válido). Aposentamos todos os ativos para criar o novo.
                        const allIds = activeContracts.map(c => c.id);
                        await supabaseAdmin
                            .from("contratos")
                            .update({ status: ContratoStatus.SUBSTITUIDO })
                            .in("id", allIds);
                    }
                } 
                
                await contractService.criarContrato(usuario.auth_uid, {
                    passageiroId: id,
                    provider: ContratoProvider.INHOUSE
                });
            } catch (err) {
                console.error("[updatePassageiro] Falha ao substituir contrato", err);
            }
        }
    }

    return updated;
};

const deletePassageiro = async (id: string): Promise<void> => {
    if (!id) throw new Error("ID do passageiro é obrigatório");

    const passageiro = await getPassageiro(id);

    if (passageiro?.id) {
         // Verificar se tem cobranças (pendentes ou pagas)
         const { count, error: countError } = await supabaseAdmin
            .from("cobrancas")
            .select("id", { count: "exact", head: true })
            .eq("passageiro_id", id);
         
         if (countError) throw countError;

         if (count && count > 0) {
             throw new AppError("Passageiro possui cobranças. Desative o cadastro ou remova as cobranças.", 400);
         }

        const { error } = await supabaseAdmin.from("passageiros").delete().eq("id", id);
        if (error) throw error;
    }
};

const getPassageiro = async (id: string): Promise<any> => {
    const { data, error } = await supabaseAdmin
        .from("passageiros")
        .select(`
            *,
            escola:escolas(id, nome),
            veiculo:veiculos(id, placa, modelo),
            contratos(id, status, created_at, minuta_url, contrato_final_url)
        `)
        .eq("id", id)
        .order('created_at', { foreignTable: 'contratos', ascending: false })
        .limit(1, { foreignTable: 'contratos' })
        .single();

    if (error) throw error;
    
    // Transform to flat property for convenience/security? 
    // Or just return the array.
    // Let's attach a 'status_contrato_atual' field computed.
    const ultimoContrato = data.contratos?.[0];
    const statusContrato = ultimoContrato ? ultimoContrato.status : null;
    const contratoId = ultimoContrato ? ultimoContrato.id : null;
    // Preferencia para contrato final assinado, senao minuta
    const contratoUrl = ultimoContrato ? (ultimoContrato.contrato_final_url || ultimoContrato.minuta_url) : null;

    return {
        ...data,
        status_contrato: statusContrato,
        contrato_id: contratoId,
        contrato_url: contratoUrl,
        minuta_url: ultimoContrato?.minuta_url,
        contrato_final_url: ultimoContrato?.contrato_final_url
    };
};

const listPassageiros = async (
    usuarioId: string,
    filtros?: ListPassageirosFiltersDTO
): Promise<any[]> => {
    if (!usuarioId) throw new Error("Usuário obrigatório");

    let query = supabaseAdmin
        .from("passageiros")
        .select(`
            *,
            escola:escolas(id, nome),
            veiculo:veiculos(id, placa),
            contratos(id, status, created_at, minuta_url, contrato_final_url)
        `)
        .eq("usuario_id", usuarioId)
        .order("nome", { ascending: true });

    if (filtros?.search) {
        query = query.or(
            `nome.ilike.%${filtros.search}%,nome_responsavel.ilike.%${filtros.search}%`
        );
    }

    if (filtros?.escola) query = query.eq("escola_id", filtros.escola);
    if (filtros?.veiculo) query = query.eq("veiculo_id", filtros.veiculo);
    
    if (filtros?.ativo !== undefined) {
         query = query.eq("ativo", filtros.ativo === "true");
    }

    if (filtros?.enviar_cobranca_automatica !== undefined) {
        query = query.eq("enviar_cobranca_automatica", filtros.enviar_cobranca_automatica === "true");
    }

    const { data, error } = await query;
    if (error) throw error;

    // Map contract status to flat properties
    const passageiros = (data || []).map((p: any) => {
        // Find latest contract if multiple returned (though simpler to just take array logic if supabase returns array)
        if (p.contratos && p.contratos.length > 0) {
             // Sort just in case supabase didn't (though we can't easily sort in foreign table select without specific query)
             // Ideally we should use a view or a separate query, but for now let's sort in JS
             const contratosOnPassageiro = p.contratos.sort((a: any, b: any) => 
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
             );
             const ultimo = contratosOnPassageiro[0];
             return {
                 ...p,
                 status_contrato: ultimo.status,
                 contrato_id: ultimo.id,
                 contrato_url: ultimo.contrato_final_url || ultimo.minuta_url,
                 minuta_url: ultimo.minuta_url,
                 contrato_final_url: ultimo.contrato_final_url,
                 contratos: undefined // remove raw array to clean up
             };
        }
        return p;
    });

    return passageiros;
};

const toggleAtivo = async (passageiroId: string, novoStatus: boolean): Promise<boolean> => {
    // Se estiver ativando, precisamos verificar limites se a automação estiver ligada
    if (novoStatus === true) {
        const passageiro = await getPassageiro(passageiroId);
        
        if (passageiro?.enviar_cobranca_automatica === true) {
            // Se ele tem flag automática e está sendo ativado, consome 1 slot.
            try {
                 await subscriptionLifecycleService.verificarLimiteAutomacao(passageiro.usuario_id, 1);
            } catch (err: any) {
                 // Repassar erro de limite
                 throw new Error(err.message);
            }
        }
    }

    const { error } = await supabaseAdmin
        .from("passageiros")
        .update({ ativo: novoStatus })
        .eq("id", passageiroId);

    if (error) throw new Error(`Falha ao alterar status do passageiro: ${error.message}`);
    
    return true;
};

const getNumeroCobrancas = async (passageiroId: string): Promise<number> => {
    if (!passageiroId) throw new Error("ID do passageiro é obrigatório");

    const { count, error } = await supabaseAdmin
        .from("cobrancas")
        .select("id", { count: "exact", head: true })
        .eq("passageiro_id", passageiroId);

    if (error) throw new Error(error.message || "Erro ao contar cobranças");

    return count || 0;
};

const countListPassageirosByUsuario = async (
    usuarioId: string,
    filtros?: {
        ativo?: string;
        enviar_cobranca_automatica?: string;
    }
): Promise<number> => {
    let query = supabaseAdmin
        .from("passageiros")
        .select("id", { count: "exact", head: true })
        .eq("usuario_id", usuarioId);

    if (filtros?.ativo !== undefined) {
        query = query.eq("ativo", filtros.ativo === "true");
    }

    if (filtros?.enviar_cobranca_automatica !== undefined) {
        query = query.eq("enviar_cobranca_automatica", true);
    }

    const { count, error } = await query;

    if (error) throw new Error(error.message || "Erro ao contar passageiros");
    return count || 0;
};

const finalizePreCadastro = async (
    prePassageiroId: string,
    data: any,
    usuarioId: string
): Promise<any> => {
    // 1. Buscar Pré-Cadastro
    const { data: pre, error } = await supabaseAdmin
        .from("pre_passageiros")
        .select("*")
        .eq("id", prePassageiroId)
        .eq("usuario_id", usuarioId)
        .single();
    
    if (error || !pre) throw new AppError("Pré-cadastro não encontrado.", 404);

    // 2. Mesclar dados (Data sobrescreve Pre)
    const payload: CreatePassageiroDTO = {
        ...pre,
        ...data,
        usuario_id: usuarioId,
        // Garantir que valor_cobranca e dia_vencimento do pre sejam mantidos se não vierem no data
        valor_cobranca: data.valor_cobranca !== undefined ? data.valor_cobranca : pre.valor_cobranca,
        dia_vencimento: data.dia_vencimento !== undefined ? data.dia_vencimento : pre.dia_vencimento,
    };

    // Remover campos de sistema do pre
    delete (payload as any).id;
    delete (payload as any).created_at;
    delete (payload as any).updated_at;

    // 3. Criar Passageiro
    const novoPassageiro = await createPassageiro(payload);

    // 4. Trigger de Contrato Automático
    // Removido pois createPassageiro já realiza essa verificação e criação
    
    // 5. Deletar Pré-Cadastro
    await supabaseAdmin.from("pre_passageiros").delete().eq("id", prePassageiroId);

    return novoPassageiro;
};

// Exportar objeto unificado no final
export const passageiroService = {
    createPassageiro,
    updatePassageiro,
    deletePassageiro,
    getPassageiro,
    listPassageiros,
    toggleAtivo,
    getNumeroCobrancas,
    countListPassageirosByUsuario,
    finalizePreCadastro
};
