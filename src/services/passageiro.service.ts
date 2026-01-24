import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import { automationService } from "./automation.service.js";
import { subscriptionLifecycleService } from "./subscription-lifecycle.service.js";

import { CreatePassageiroDTO, ListPassageirosFiltersDTO, UpdatePassageiroDTO } from "../types/dtos/passageiro.dto.js";
import { PassageiroDesativacaoCobrancaAutomaticaMotivo } from "../types/enums.js";
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
    if (data.periodo !== undefined) prepared.periodo = data.periodo ? cleanString(data.periodo.toLocaleLowerCase(), false) : null;
    if (data.genero !== undefined) prepared.genero = data.genero ? cleanString(data.genero, true) : null;
    if (data.valor_cobranca !== undefined) prepared.valor_cobranca = typeof data.valor_cobranca === "string" ? moneyToNumber(data.valor_cobranca) : (data.valor_cobranca || 0);
    if (data.dia_vencimento !== undefined) prepared.dia_vencimento = data.dia_vencimento;
    
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
            await subscriptionLifecycleService.verificarLimiteAutonacao(data.usuario_id, 1);
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

    return inserted;
};

const updatePassageiro = async (id: string, data: UpdatePassageiroDTO): Promise<any> => {
    if (!id) throw new Error("ID do passageiro é obrigatório");

    const passageiroData = _preparePassageiroData(data, undefined, true);
    
    // Validar se pode ativar cobranças automáticas
    if (data.enviar_cobranca_automatica !== undefined) {
        // Se tentando ativar, validar se tem plano Profissional e Limites
        if (data.enviar_cobranca_automatica === true) {
            // Se o passageiro já estava marcado como automático E ativo, não conta como "+1" novo, 
            // mas a função verificarLimiteAutonacao do service conta quantos JÁ existem no banco.
            
            // Buscar estado atual para saber se é incremento
            const estadoAtual = await getPassageiro(id);
            const isIncremento = !estadoAtual.enviar_cobranca_automatica; // Se era false, vira true => +1

            if (isIncremento) {
                try {
                    await subscriptionLifecycleService.verificarLimiteAutonacao(estadoAtual.usuario_id, 1);
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
    if (data.enviar_cobranca_automatica === true) {
        try {
            await automationService.verificarGerarCobrancaMesSeguinte(updated.id, updated, updated.usuario_id);
        } catch (err) {
             console.error("[updatePassageiro] Falha na safety net de cobrança futura", err);
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
            veiculo:veiculos(id, placa, modelo)
        `)
        .eq("id", id)
        .single();
    if (error) throw error;
    return data;
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
            veiculo:veiculos(id, placa)
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

    return data || [];
};

const toggleAtivo = async (passageiroId: string, novoStatus: boolean): Promise<boolean> => {
    // Se estiver ativando, precisamos verificar limites se a automação estiver ligada
    if (novoStatus === true) {
        const passageiro = await getPassageiro(passageiroId);
        
        if (passageiro?.enviar_cobranca_automatica === true) {
            // Se ele tem flag automática e está sendo ativado, consome 1 slot.
            try {
                 await subscriptionLifecycleService.verificarLimiteAutonacao(passageiro.usuario_id, 1);
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

    // 4. Deletar Pré-Cadastro
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
