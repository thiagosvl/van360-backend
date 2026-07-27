import { gastoCategoriaRepository } from "../repositories/gasto-categoria.repository.js";
import { CreateGastoCategoriaDTO, UpdateGastoCategoriaDTO } from "../types/dtos/gasto-categoria.dto.js";
import { supabaseAdmin } from "../config/supabase.js";

function generateSlug(str: string): string {
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove acentos
        .replace(/[^a-z0-9\s-]/g, "") // Remove caracteres especiais
        .trim()
        .replace(/\s+/g, "-") // Troca espaços por -
        .replace(/-+/g, "-"); // Evita múltiplos hifens
}

export const gastoCategoriaService = {
    async createCategoria(usuarioId: string, data: CreateGastoCategoriaDTO) {
        const slug = generateSlug(data.nome);

        // 1. Validar se é uma categoria reservada do sistema
        const slugsGlobaisReservados = [
            "combustivel", "manutencao", "impostos", "multas", 
            "lavagem", "alimentacao", "seguro", "outros"
        ];
        if (slugsGlobaisReservados.includes(slug)) {
            throw new Error("Esta categoria é reservada pelo sistema.");
        }

        // 2. Verificar duplicados (pelo slug ou pelo nome exato para este usuário)
        const [existeSlug, existeNome] = await Promise.all([
            gastoCategoriaRepository.getBySlugAndUsuario(slug, usuarioId),
            gastoCategoriaRepository.getByNomeAndUsuario(data.nome, usuarioId)
        ]);

        if (existeSlug.data || existeNome.data) {
            throw new Error("Você já possui uma categoria com este nome.");
        }

        const prepared = {
            usuario_id: usuarioId,
            nome: data.nome.trim(),
            slug,
            cor: data.cor || "slate",
            icone: data.icone || "Tag"
        };

        const result = await gastoCategoriaRepository.insert(prepared);
        if (result.error) throw new Error(result.error.message);

        return result.data;
    },

    async listCategorias(usuarioId: string) {
        const result = await gastoCategoriaRepository.list(usuarioId);
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    },

    async deleteCategoria(id: string, usuarioId: string) {
        const categoriaRes = await gastoCategoriaRepository.getById(id);
        if (categoriaRes.error || !categoriaRes.data) {
            throw new Error("Categoria não encontrada.");
        }

        const categoria = categoriaRes.data;

        // Validar se pertence ao usuário
        if (!categoria.usuario_id) {
            throw new Error("Não é possível excluir categorias padrão do sistema.");
        }

        if (categoria.usuario_id !== usuarioId) {
            throw new Error("Você não tem permissão para excluir esta categoria.");
        }

        const result = await gastoCategoriaRepository.delete(id);
        if (result.error) throw new Error(result.error.message);

        return { success: true };
    },

    async updateCategoria(id: string, usuarioId: string, data: UpdateGastoCategoriaDTO) {
        const categoriaRes = await gastoCategoriaRepository.getById(id);
        if (categoriaRes.error || !categoriaRes.data) {
            throw new Error("Categoria não encontrada.");
        }

        const categoria = categoriaRes.data;

        // Validar se pertence ao usuário
        if (!categoria.usuario_id) {
            throw new Error("Não é possível alterar categorias padrão do sistema.");
        }

        if (categoria.usuario_id !== usuarioId) {
            throw new Error("Você não tem permissão para alterar esta categoria.");
        }

        const prepared: any = {};
        if (data.cor !== undefined) prepared.cor = data.cor;
        if (data.icone !== undefined) prepared.icone = data.icone;

        let novoSlug: string | undefined;
        let antigoSlug = categoria.slug;

        if (data.nome !== undefined && data.nome.trim() !== categoria.nome) {
            const nomeTrimmed = data.nome.trim();
            const slug = generateSlug(nomeTrimmed);

            // Validar se é reservada
            const slugsGlobaisReservados = [
                "combustivel", "manutencao", "impostos", "multas", 
                "lavagem", "alimentacao", "seguro", "outros"
            ];
            if (slugsGlobaisReservados.includes(slug)) {
                throw new Error("Esta categoria é reservada pelo sistema.");
            }

            // Validar duplicados para o mesmo usuário
            const [existeSlug, existeNome] = await Promise.all([
                gastoCategoriaRepository.getBySlugAndUsuario(slug, usuarioId),
                gastoCategoriaRepository.getByNomeAndUsuario(nomeTrimmed, usuarioId)
            ]);

            if (existeSlug.data || existeNome.data) {
                throw new Error("Você já possui uma categoria com este nome.");
            }

            prepared.nome = nomeTrimmed;
            prepared.slug = slug;
            novoSlug = slug;
        }

        const result = await gastoCategoriaRepository.update(id, prepared);
        if (result.error) throw new Error(result.error.message);

        // Se o slug mudou, atualiza os gastos antigos em cascata
        if (novoSlug && antigoSlug && novoSlug !== antigoSlug) {
            const { error: cascadeError } = await supabaseAdmin
                .from("gastos")
                .update({ categoria: novoSlug })
                .eq("categoria", antigoSlug)
                .eq("usuario_id", usuarioId);

            if (cascadeError) {
                console.error("[Category Update Cascade Error]:", cascadeError.message);
            }
        }

        return result.data;
    }
};
