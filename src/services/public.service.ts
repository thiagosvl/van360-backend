import { userRepository } from "../repositories/user.repository.js";
import { escolaRepository } from "../repositories/escola.repository.js";
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
