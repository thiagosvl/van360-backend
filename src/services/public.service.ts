import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";

export async function validateMotoristaPublic(motoristaId: string) {
    const { data, error } = await supabaseAdmin
        .from("usuarios")
        .select(`
            id, 
            nome, 
            apelido, 
            assinaturas_usuarios (
                *,
                planos (*, parent:parent_id (*))
            )
        `)
        .eq("id", motoristaId)
        .single();

    if (error || !data) {
        throw new AppError("Motorista não encontrado ou link inválido.", 404);
    }

    return data;
}
