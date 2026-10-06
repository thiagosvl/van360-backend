import { userRepository } from "../repositories/user.repository.js";
import { AppError } from "../errors/AppError.js";

export async function getUserProfile(userId: string) {
    const { data, error } = await userRepository.getProfileWithConfig(userId);

    if (error) {
        throw error;
    }

    if (!data) {
        throw new AppError("Perfil não encontrado.", 404);
    }

    if (!data.ativo) {
        throw new AppError("Conta inativa.", 403);
    }

    const rawConfig = (data as Record<string, unknown>).configuracoes;
    const config = Array.isArray(rawConfig) ? rawConfig[0] : rawConfig;
    const formatoNome = (config && typeof config === "object" && "formato_nome_responsavel" in config && typeof config.formato_nome_responsavel === "string")
        ? config.formato_nome_responsavel
        : "primeiro_nome";

    return {
        ...data,
        configuracoes: {
            formato_nome_responsavel: formatoNome,
        },
    };
}
