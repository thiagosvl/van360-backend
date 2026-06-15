import { passageiroRepository } from "../repositories/passageiro.repository.js";
import { prePassageiroRepository } from "../repositories/pre-passageiro.repository.js";
import { AppError } from "../errors/AppError.js";
import { CreatePassageiroDTO, ListPassageirosFiltersDTO, UpdatePassageiroDTO } from "../types/dtos/passageiro.dto.js";
import { AtividadeAcao, AtividadeEntidadeTipo } from "../types/enums.js";
import { moneyToNumber } from "../utils/currency.utils.js";
import { cleanString, onlyDigits } from "../utils/string.utils.js";
import { historicoService } from "./historico.service.js";
import { parseLocalDate, toPersistenceString } from "../utils/date.utils.js";

// Métodos privados auxiliares
const _preparePassageiroData = (data: Partial<CreatePassageiroDTO>, usuarioId?: string, isUpdate: boolean = false): Record<string, unknown> => {
    const prepared: Record<string, unknown> = {};

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

    // Endereço (Algumas chaves podem vir no passthrough)
    const flexData = data as Record<string, any>;
    if (data.logradouro !== undefined) prepared.logradouro = data.logradouro ? cleanString(data.logradouro, true) : null;
    if (flexData.numero !== undefined) prepared.numero = flexData.numero ? cleanString(flexData.numero, true) : null;
    if (data.bairro !== undefined) prepared.bairro = data.bairro ? cleanString(data.bairro, true) : null;
    if (data.cidade !== undefined) prepared.cidade = data.cidade ? cleanString(data.cidade, true) : null;
    if (flexData.estado !== undefined) prepared.estado = flexData.estado ? cleanString(flexData.estado, true) : null;
    if (flexData.cep !== undefined) prepared.cep = flexData.cep ? onlyDigits(flexData.cep) : null;
    if (data.referencia !== undefined) prepared.referencia = data.referencia ? cleanString(data.referencia, true) : null;
    if (data.observacoes !== undefined) prepared.observacoes = data.observacoes ? cleanString(data.observacoes, true) : null;

    // Detalhes
    if (data.periodo !== undefined) prepared.periodo = data.periodo ? cleanString(data.periodo.toLocaleLowerCase()) : null;
    if (data.genero !== undefined) prepared.genero = data.genero ? cleanString(data.genero) : null;
    if (data.valor_cobranca !== undefined) prepared.valor_cobranca = typeof data.valor_cobranca === "string" ? moneyToNumber(data.valor_cobranca) : (data.valor_cobranca || 0);
    if (data.dia_vencimento !== undefined) prepared.dia_vencimento = data.dia_vencimento;

    // Novos Campos
    if (data.modalidade !== undefined) prepared.modalidade = data.modalidade;
    if (data.data_nascimento !== undefined) prepared.data_nascimento = data.data_nascimento ? toPersistenceString(data.data_nascimento) : null;
    if (data.parentesco_responsavel !== undefined) prepared.parentesco_responsavel = data.parentesco_responsavel;
    if (data.data_inicio_transporte !== undefined) prepared.data_inicio_transporte = data.data_inicio_transporte ? toPersistenceString(data.data_inicio_transporte) : null;
    if (data.data_fim_transporte !== undefined) prepared.data_fim_transporte = data.data_fim_transporte ? toPersistenceString(data.data_fim_transporte) : null;
    if (data.enviar_notificacoes !== undefined) prepared.enviar_notificacoes = data.enviar_notificacoes;


    // Controle
    if (data.ativo !== undefined) prepared.ativo = data.ativo;

    return prepared;
};

const createPassageiro = async (data: CreatePassageiroDTO): Promise<any> => {
    if (!data.usuario_id) throw new Error("Usuário obrigatório");
    if (!data.nome) throw new Error("Nome do passageiro é obrigatório");


    const passageiroData = _preparePassageiroData(data, data.usuario_id, false);

    const { data: inserted, error } = await passageiroRepository.insert(passageiroData);

    if (error) throw error;

    // --- LOG DE AUDITORIA ---
    historicoService.log({
        usuario_id: inserted.usuario_id,
        entidade_tipo: AtividadeEntidadeTipo.PASSAGEIRO,
        entidade_id: inserted.id,
        acao: AtividadeAcao.PASSAGEIRO_CRIADO,
        descricao: `Novo passageiro ${inserted.nome} cadastrado.`,
        meta: {
            nome: inserted.nome,
            responsavel: inserted.nome_responsavel,
            valor_cobranca: inserted.valor_cobranca
        }
    });

    return inserted;
};

const updatePassageiro = async (id: string, data: UpdatePassageiroDTO): Promise<any> => {
    if (!id) throw new Error("ID do passageiro é obrigatório");

    // 1. Buscar estado ATUAL (antes do update) para comparações
    const estadoAnterior = await getPassageiro(id);
    if (!estadoAnterior) throw new AppError("Passageiro não encontrado", 404);

    const passageiroData = _preparePassageiroData(data, undefined, true);

    const { data: updated, error } = await passageiroRepository.update(id, passageiroData);

    if (error) throw error;

    // 2. Lógica de Substituição de Contrato
    // Helper simples para valor do DTO
    const getValorNumerico = (v: any) => typeof v === 'string' ? moneyToNumber(v) : v;
    const flexData = data as Record<string, any>;

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
        (data.data_fim_transporte !== undefined && data.data_fim_transporte !== estadoAnterior.data_fim_transporte) ||
        (data.logradouro !== undefined && data.logradouro !== estadoAnterior.logradouro) ||
        (flexData.numero !== undefined && flexData.numero !== estadoAnterior.numero) ||
        (data.bairro !== undefined && data.bairro !== estadoAnterior.bairro) ||
        (data.cidade !== undefined && data.cidade !== estadoAnterior.cidade) ||
        (flexData.estado !== undefined && flexData.estado !== estadoAnterior.estado) ||
        (flexData.cep !== undefined && flexData.cep !== estadoAnterior.cep);

    // 2. LOG DE AUDITORIA (Qualquer edição)
    historicoService.log({
        usuario_id: updated.usuario_id,
        entidade_tipo: AtividadeEntidadeTipo.PASSAGEIRO,
        entidade_id: id,
        acao: AtividadeAcao.PASSAGEIRO_EDITADO,
        descricao: `Cadastro de ${updated.nome} atualizado.`,
        meta: {
            houve_mudanca_contratual: houveMudancaContratual,
            campos_enviados: Object.keys(data)
        }
    });

    return updated;
};

const deletePassageiro = async (id: string): Promise<void> => {
    if (!id) throw new Error("ID do passageiro é obrigatório");

    const passageiro = await getPassageiro(id);

    if (passageiro?.id) {
        // Verificar se tem cobranças (pendentes ou pagas)
        const { count, error: countError } = await passageiroRepository.countCobrancas(id);

        if (countError) throw countError;

        if (count && count > 0) {
            throw new AppError("Passageiro possui mensalidades. Para excluir, é necessário antes excluir as mensalidades. Se preferir, você também pode apenas desativar o cadastro.", 400);
        }

        const { error } = await passageiroRepository.delete(id);
        if (error) throw error;

        // --- LOG DE AUDITORIA ---
        historicoService.log({
            usuario_id: passageiro.usuario_id,
            entidade_tipo: AtividadeEntidadeTipo.PASSAGEIRO,
            entidade_id: id,
            acao: AtividadeAcao.PASSAGEIRO_EXCLUIDO,
            descricao: `Passageiro ${passageiro.nome} removido permanentemente.`,
            meta: {
                backup: passageiro
            }
        });
    }
}

const getPassageiro = async (id: string): Promise<any> => {
    const { data, error } = await passageiroRepository.getById(id);

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
        contrato_final_url: ultimoContrato?.contrato_final_url,
        token_acesso: ultimoContrato?.token_acesso
    };
};

const listPassageiros = async (
    usuarioId: string,
    filtros?: ListPassageirosFiltersDTO
): Promise<any[]> => {
    if (!usuarioId) throw new Error("Usuário obrigatório");

    const { data, error } = await passageiroRepository.list(usuarioId, filtros);
    if (error) throw error;

    // Map contract status to flat properties
    const passageiros = (data || []).map((p: Record<string, any>) => {
        // Find latest contract if multiple returned (though simpler to just take array logic if supabase returns array)
        if (p.contratos && p.contratos.length > 0) {
            // Sort just in case supabase didn't (though we can't easily sort in foreign table select without specific query)
            // Ideally we should use a view or a separate query, but for now let's sort in JS
            const contratosOnPassageiro = p.contratos.sort((a: Record<string, any>, b: Record<string, any>) =>
                parseLocalDate(b.created_at).getTime() - parseLocalDate(a.created_at).getTime()
            );
            const ultimo = contratosOnPassageiro[0];
            return {
                ...p,
                status_contrato: ultimo.status,
                contrato_id: ultimo.id,
                contrato_status: ultimo.status,
                contrato_url: ultimo.contrato_final_url || ultimo.minuta_url,
                minuta_url: ultimo.minuta_url,
                contrato_final_url: ultimo.contrato_final_url,
                token_acesso: ultimo.token_acesso,
                contratos: undefined
            };
        }
        return p;
    });

    return passageiros;
};

const toggleAtivo = async (passageiroId: string, novoStatus: boolean): Promise<boolean> => {

    const { error } = await passageiroRepository.updateAtivo(passageiroId, novoStatus);

    if (error) throw new Error(`Falha ao alterar status do passageiro: ${error.message}`);

    // --- LOG DE AUDITORIA ---
    const { data: pass } = await passageiroRepository.getUsuarioIdAndNome(passageiroId);
    if (pass) {
        historicoService.log({
            usuario_id: pass.usuario_id,
            entidade_tipo: AtividadeEntidadeTipo.PASSAGEIRO,
            entidade_id: passageiroId,
            acao: AtividadeAcao.PASSAGEIRO_STATUS,
            descricao: `Cadastro de ${pass.nome} foi ${novoStatus ? 'ATIVADO' : 'DESATIVADO'}.`,
            meta: { ativo: novoStatus }
        });
    }

    return true;
}

const countListPassageirosByUsuario = async (
    usuarioId: string,
    filtros?: {
        ativo?: string;
    }
): Promise<number> => {
    const { count, error } = await passageiroRepository.countByUsuario(usuarioId, filtros);

    if (error) throw new Error(error.message || "Erro ao contar passageiros");
    return count || 0;
};

const finalizePreCadastro = async (
    prePassageiroId: string,
    data: Partial<CreatePassageiroDTO>,
    usuarioId: string
): Promise<any> => {
    // 1. Buscar Pré-Cadastro
    const { data: pre, error } = await prePassageiroRepository.getById(prePassageiroId, usuarioId);

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
    delete (payload as Record<string, unknown>).id;
    delete (payload as Record<string, unknown>).created_at;
    delete (payload as Record<string, unknown>).updated_at;

    // 3. Criar Passageiro
    const novoPassageiro = await createPassageiro(payload);

    // 4. Trigger de Contrato Automático
    // Removido pois createPassageiro já realiza essa verificação e criação

    // 5. Deletar Pré-Cadastro
    await prePassageiroRepository.delete(prePassageiroId);

    // --- LOG DE AUDITORIA ---
    historicoService.log({
        usuario_id: usuarioId,
        entidade_tipo: AtividadeEntidadeTipo.PASSAGEIRO,
        entidade_id: novoPassageiro.id,
        acao: AtividadeAcao.PRE_CADASTRO_CONCLUIDO,
        descricao: `Interesse de vaga (${novoPassageiro.nome}) convertido em passageiro.`,
        meta: { pre_id: prePassageiroId }
    });

    return novoPassageiro;
}

const lookupResponsavelByCpf = async (usuarioId: string, cpf: string): Promise<any> => {
    if (!usuarioId) throw new AppError("Usuário não identificado", 401);
    if (!cpf) throw new AppError("CPF obrigatório", 400);

    const cpfClean = onlyDigits(cpf);

    const { data, error } = await passageiroRepository.lookupResponsavel(usuarioId, cpfClean);

    if (error) {
        throw new AppError("Erro ao buscar responsável.", 500);
    }

    return data;
};

// Exportar objeto unificado no final
export const passageiroService = {
    createPassageiro,
    updatePassageiro,
    deletePassageiro,
    getPassageiro,
    listPassageiros,
    toggleAtivo,
    countListPassageirosByUsuario,
    finalizePreCadastro,
    lookupResponsavelByCpf
};
