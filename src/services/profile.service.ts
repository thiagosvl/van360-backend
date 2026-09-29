import { userRepository } from "../repositories/user.repository.js";
import { AppError } from "../errors/AppError.js";

export async function getUserProfile(userId: string) {
    const { data, error } = await userRepository.getById(userId);

    if (error) {
        throw error;
    }

    if (!data) {
        throw new AppError("Perfil não encontrado.", 404);
    }

    // Regra de Segurança: Usuário inativo não acessa perfil
    if (!data.ativo) {
        throw new AppError("Conta inativa.", 403);
    }

    return data;
}
