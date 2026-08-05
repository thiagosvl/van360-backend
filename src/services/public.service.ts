import { userRepository } from "../repositories/user.repository.js";
import { escolaRepository } from "../repositories/escola.repository.js";
import { passageiroRepository } from "../repositories/passageiro.repository.js";
import { AppError } from "../errors/AppError.js";

export async function validateMotoristaPublic(motoristaId: string) {
    const { data, error } = await userRepository.getPublicData(motoristaId);

    if (error || !data) {
        throw new AppError("Motorista não encontrado ou link inválido.", 404);
    }

    return data;
}

export async function listEscolasPublic(motoristaId: string): Promise<any[]> {
    const { data, error } = await escolaRepository.list(motoristaId, { ativo: "true" } as any);

    if (error) {
        throw new AppError("Erro ao buscar escolas do motorista.", 400);
    }

    return data || [];
}

export async function getCarteirinhaPublica(passageiroId: string) {
    if (!passageiroId) {
        throw new AppError("ID da carteirinha é obrigatório.", 400);
    }

    const { data, error } = await passageiroRepository.getById(passageiroId).catch(() => ({ data: null, error: true }));

    if (error || !data) {
        throw new AppError("Carteirinha pública do passageiro não encontrada.", 404);
    }

    if (!data.ativo) {
        throw new AppError("Carteirinha inativa ou cancelada.", 403);
    }

    return {
        id: data.id,
        nome: data.nome,
        foto_url: data.foto_url || null,
        periodo: data.periodo,
        modalidade: data.modalidade,
        nome_responsavel: data.nome_responsavel,
        telefone_responsavel: data.telefone_responsavel,
        escola: data.escola ? { id: data.escola.id, nome: data.escola.nome } : null,
        veiculo: data.veiculo ? { id: data.veiculo.id, placa: data.veiculo.placa, modelo: data.veiculo.modelo } : null,
        codigo_validacao: `CARD-${data.id.substring(0, 8).toUpperCase()}`,
        status: "VALIDA"
    };
}
