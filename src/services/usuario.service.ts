import { TIPOS_CHAVE_PIX_VALIDOS, TipoChavePix } from "../config/constants.js";
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import { cleanString, onlyDigits } from "../utils/string.utils.js";
import { iniciarValidacaoPix } from "./validacao-pix.service.js";

/**
 * Helper para obter dados do usuário
 */
export async function getUsuarioData(usuarioId: string) {
  const { data: usuario, error } = await supabaseAdmin
    .from("usuarios")
    .select("id, nome, cpfcnpj, telefone")
    .eq("id", usuarioId)
    .single();

  if (error || !usuario) {
    throw new AppError("Usuário não encontrado.", 404);
  }

  return usuario;
}

export async function validarAcessoUsuario(authUid: string, targetUsuarioId: string): Promise<boolean> {
    const { data: usuario } = await supabaseAdmin
        .from("usuarios")
        .select("id")
        .eq("auth_uid", authUid)
        .single();
    
    if (usuario && usuario.id === targetUsuarioId) {
        return true;
    }
    return false;
}

export async function atualizarUsuario(usuarioId: string, payload: {
  nome?: string;
  apelido?: string;
  telefone?: string;
  chave_pix?: string;
  tipo_chave_pix?: string;
}) {
  if (!usuarioId) throw new AppError("ID do usuário é obrigatório.", 400);

  const updates: any = { updated_at: new Date().toISOString() };
  if (payload.nome) updates.nome = cleanString(payload.nome, true);
  if (payload.apelido) updates.apelido = cleanString(payload.apelido, true);
  if (payload.telefone) updates.telefone = onlyDigits(payload.telefone);

  // Atualização de PIX com Sanitização Obrigatória e TRIGGER DE VALIDAÇÃO
  if (payload.chave_pix !== undefined) {
    // Validação estrita do ENUM
    if (payload.tipo_chave_pix && !TIPOS_CHAVE_PIX_VALIDOS.includes(payload.tipo_chave_pix as any)) {
      throw new AppError("Tipo de chave PIX inválido.", 400);
    }

    const tipoConsiderado = payload.tipo_chave_pix || undefined; // Se não enviado, assume que o usuário mantém o tipo

    let chaveSanitizada = "";

    // Se temos o tipo e é um dos numéricos, remover formatação
    if (tipoConsiderado && [TipoChavePix.CPF, TipoChavePix.CNPJ, TipoChavePix.TELEFONE].includes(tipoConsiderado as any)) {
      chaveSanitizada = onlyDigits(payload.chave_pix);
    } else {
      // Para E-mail, Aleatória ou se não temos o tipo (fallback), apenas limpar espaços
      chaveSanitizada = cleanString(payload.chave_pix);
    }

    updates.chave_pix = chaveSanitizada;
    if (payload.tipo_chave_pix) updates.tipo_chave_pix = payload.tipo_chave_pix;

    // RESETAR STATUS E INICIAR VALIDAÇÃO
    updates.status_chave_pix = "PENDENTE_VALIDACAO";
    updates.chave_pix_validada_em = null;
    updates.nome_titular_pix_validado = null;
    updates.cpf_cnpj_titular_pix_validado = null;
  }

  const { error } = await supabaseAdmin
    .from("usuarios")
    .update(updates)
    .eq("id", usuarioId);

  if (error) {
    throw new AppError(`Erro ao atualizar usuário: ${error.message}`, 500);
  }

  // TRIGGER ASYNC VALIDATION (Se houve alteração de PIX)
  if (payload.chave_pix !== undefined) {
    // Disparar validação em background
    iniciarValidacaoPix(usuarioId, updates.chave_pix, payload.tipo_chave_pix)
      .catch(err => {
        logger.error({ error: err.message, usuarioId }, "Falha silenciosa ao iniciar validação PIX (background) após update.");
      });
  }

  return { success: true };
}
