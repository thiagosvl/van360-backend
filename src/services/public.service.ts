import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";

export async function validateMotoristaPublic(motoristaId: string) {
    const { data, error } = await supabaseAdmin
        .from("usuarios")
        .select(`
            id, 
            nome, 
            apelido
        `)
        .eq("id", motoristaId)
        .single();

    if (error || !data) {
        throw new AppError("Motorista não encontrado ou link inválido.", 404);
    }

    return data;
}

export async function listEscolasPublic(motoristaId: string): Promise<any[]> {
    const { data, error } = await supabaseAdmin
        .from("escolas")
        .select("*")
        .eq("usuario_id", motoristaId)
        .eq("ativo", true)
        .order("nome", { ascending: true });

    if (error) {
        throw new AppError("Erro ao buscar escolas do motorista.", 400);
    }

    return data || [];
}
