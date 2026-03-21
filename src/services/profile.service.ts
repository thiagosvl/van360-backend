import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";

export async function getUserProfile(userId: string) {
    const { data, error } = await supabaseAdmin
        .from("usuarios")
        .select(`
            *
        `)
        .eq("id", userId)
        .maybeSingle();

    if (error) {
        throw new AppError("Erro ao buscar perfil.", 500);
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
