import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import { subscriptionLifecycleService } from "./subscription-lifecycle.service.js";

import { CreatePassageiroDTO, ListPassageirosFiltersDTO, UpdatePassageiroDTO } from "../types/dtos/passageiro.dto.js";
import { CobrancaOrigem, CobrancaTipo, DesativacaoMotivo } from "../types/enums.js";
import { moneyToNumber } from "../utils/currency.utils.js";
import { cleanString, onlyDigits } from "../utils/string.utils.js";
import { cobrancaService } from "./cobranca.service.js";

// Métodos privados auxiliares
const _preparePassageiroData = (data: CreatePassageiroDTO | any, usuarioId: string, ativoDefault: boolean = true): any => {
    return {
        usuario_id: usuarioId,
        nome: cleanString(data.nome, true),
        escola_id: data.escola_id === "none" ? null : data.escola_id, // Front sometimes sends "none"
        veiculo_id: data.veiculo_id === "none" ? null : data.veiculo_id,
        nome_responsavel: data.nome_responsavel ? cleanString(data.nome_responsavel, true) : null,
        cpf_responsavel: data.cpf_responsavel ? onlyDigits(data.cpf_responsavel) : null,
        telefone_responsavel: data.telefone_responsavel ? onlyDigits(data.telefone_responsavel) : null,
        email_responsavel: data.email_responsavel ? cleanString(data.email_responsavel) : null,
        logradouro: data.logradouro ? cleanString(data.logradouro, true) : null,
        numero: data.numero ? cleanString(data.numero, true) : null,
        bairro: data.bairro ? cleanString(data.bairro, true) : null,
        cidade: data.cidade ? cleanString(data.cidade, true) : null,
        estado: data.estado ? cleanString(data.estado, true) : null,
        cep: data.cep ? onlyDigits(data.cep) : null,
        dia_vencimento: data.dia_vencimento || 10,
        valor_cobranca: typeof data.valor_cobranca === "string" ? moneyToNumber(data.valor_cobranca) : (data.valor_cobranca || 0),
        ativo: ativoDefault,
        referencia: data.referencia ? cleanString(data.referencia, true) : null,
        observacoes: data.observacoes ? cleanString(data.observacoes, true) : null,
        periodo: data.periodo || null,
        genero: data.genero || null,
        enviar_cobranca_automatica: !!data.enviar_cobranca_automatica,
    };
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

    const passageiroData = _preparePassageiroData(data, data.usuario_id, true);

    const { data: inserted, error } = await supabaseAdmin
        .from("passageiros")
        .insert([passageiroData])
        .select()
        .single();

    if (error) throw error;
    
    // Se marcou opção de gerar cobrança mês atual
    if (data.emitir_cobranca_mes_atual) {
         try {
             const valor = inserted.valor_cobranca;
             if (valor && valor > 0) {
                 const hoje = new Date();
                 // Usar componentes locais para evitar virada de dia por fuso horário UTC no toISOString
                 const dataVencimento = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
                 
                 logger.info({ 
                    passageiroId: inserted.id, 
                    valor, 
                    dataVencimento 
                 }, "Gerando cobrança inicial imediata...");
                 
                 await cobrancaService.createCobranca({
                    usuario_id: data.usuario_id,
                    passageiro_id: inserted.id,
                    valor: valor,
                    data_vencimento: dataVencimento,
                    tipo: CobrancaTipo.MENSALIDADE,
                    origem: CobrancaOrigem.AUTOMATICA,
                    mes: hoje.getMonth() + 1,
                    ano: hoje.getFullYear(),
                    gerarPixAsync: true
                 }, { gerarPixAsync: true });
             }
         } catch (err: any) {
             logger.error({ 
                err: err.message, 
                stack: err.stack,
                passageiroId: inserted.id 
             }, "Erro ao gerar cobrança inicial automática");
             // Não dar throw para não falhar a criação do passageiro, apenas logar erro da cobrança
         }
    }

    return inserted;
};

const updatePassageiro = async (id: string, data: UpdatePassageiroDTO): Promise<any> => {
    if (!id) throw new Error("ID do passageiro é obrigatório");

    const passageiroData: any = {};
    if (data.nome) passageiroData.nome = cleanString(data.nome, true);
    if (data.escola_id !== undefined) passageiroData.escola_id = data.escola_id === "none" ? null : data.escola_id;
    if (data.veiculo_id !== undefined) passageiroData.veiculo_id = data.veiculo_id === "none" ? null : data.veiculo_id;
    if (data.nome_responsavel) passageiroData.nome_responsavel = cleanString(data.nome_responsavel, true);
    if (data.email_responsavel) passageiroData.email_responsavel = cleanString(data.email_responsavel);
    if (data.logradouro) passageiroData.logradouro = cleanString(data.logradouro as string, true);
    if (data.numero) passageiroData.numero = cleanString(data.numero as string, true);
    if (data.bairro) passageiroData.bairro = cleanString(data.bairro as string, true);
    if (data.cidade) passageiroData.cidade = cleanString(data.cidade as string, true);
    if (data.estado) passageiroData.estado = cleanString(data.estado as string, true);
    if (data.cep) passageiroData.cep = onlyDigits(data.cep as string);
    if (data.referencia) passageiroData.referencia = cleanString(data.referencia as string, true);
    if (data.observacoes) passageiroData.observacoes = cleanString(data.observacoes as string, true);
    if (data.periodo) passageiroData.periodo = cleanString(data.periodo as string, true);
    if (data.genero) passageiroData.genero = cleanString(data.genero as string, true);
    if (data.valor_cobranca !== undefined) passageiroData.valor_cobranca = typeof data.valor_cobranca === "string" ? moneyToNumber(data.valor_cobranca) : data.valor_cobranca;
    if (data.dia_vencimento !== undefined) passageiroData.dia_vencimento = data.dia_vencimento;
    if (data.cpf_responsavel) passageiroData.cpf_responsavel = onlyDigits(data.cpf_responsavel);
    if (data.telefone_responsavel) passageiroData.telefone_responsavel = onlyDigits(data.telefone_responsavel);
    
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
            passageiroData.motivo_desativacao = DesativacaoMotivo.MANUAL;
        } else if (data.enviar_cobranca_automatica === true) {
            passageiroData.motivo_desativacao = null;
        }
    }

    const { data: updated, error } = await supabaseAdmin
        .from("passageiros")
        .update(passageiroData)
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;

    return updated;
};

const deletePassageiro = async (id: string): Promise<void> => {
    if (!id) throw new Error("ID do passageiro é obrigatório");

    const passageiro = await getPassageiro(id);

    if (passageiro?.id) {
         // Verificar se tem cobranças pendentes? (Regra de negócio opcional)
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
    usuarioId: string,
    emitirCobranca: boolean
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
        emitir_cobranca_mes_atual: emitirCobranca,
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
