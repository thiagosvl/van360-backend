import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import { PixKeyStatus, PixKeyType } from "../types/enums.js";
import { cleanString, onlyDigits } from "../utils/string.utils.js";
import { iniciarValidacaoPix } from "./validacao-pix.service.js";

/**
 * Helper para obter dados do usuário
 */
export async function getUsuarioData(usuarioId: string) {
  const { data: usuario, error } = await supabaseAdmin
    .from("usuarios")
    .select("id, nome, cpfcnpj, telefone, chave_pix")
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
    if (payload.tipo_chave_pix && !Object.values(PixKeyType).includes(payload.tipo_chave_pix as any)) {
      throw new AppError("Tipo de chave PIX inválido.", 400);
    }

    const tipoConsiderado = payload.tipo_chave_pix || undefined; // Se não enviado, assume que o usuário mantém o tipo

    let chaveSanitizada = "";

    // Se temos o tipo e é um dos numéricos, remover formatação
    if (tipoConsiderado && [PixKeyType.CPF, PixKeyType.CNPJ, PixKeyType.TELEFONE].includes(tipoConsiderado as any)) {
      chaveSanitizada = onlyDigits(payload.chave_pix);
    } else {
      // Para E-mail, Aleatória ou se não temos o tipo (fallback), apenas limpar espaços
      chaveSanitizada = cleanString(payload.chave_pix);
    }

    updates.chave_pix = chaveSanitizada;
    if (payload.tipo_chave_pix) updates.tipo_chave_pix = payload.tipo_chave_pix;

    // RESETAR STATUS E INICIAR VALIDAÇÃO
    updates.status_chave_pix = PixKeyStatus.PENDENTE_VALIDACAO;
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

export async function excluirUsuario(usuarioId: string, authUid: string) {
    // 1. Cleanup Whatsapp
    // Importação dinâmica para evitar dependência circular se houver, ou mover para topo se seguro.
    // Assumindo que whatsappService pode ser importado pois usuario.service é baixo nível.
    // Mas whatsappService usa notificationService que usa templates... ok.
    const { whatsappService } = await import("./whatsapp.service.js");
    
    // Obter nome da instância (geralmente baseada no ID)
    const instanceName = whatsappService.getInstanceName(usuarioId);
    
    try {
        logger.info({ usuarioId, instanceName }, "Tentando desconectar/remover instância WhatsApp antes da exclusão...");
        await whatsappService.deleteInstance(instanceName);
        logger.info({ usuarioId }, "Instância Whatsapp removida com sucesso.");
    } catch (error: any) {
        logger.warn({ usuarioId, error: error.message }, "Falha não-bloqueante ao remover instância Whatsapp (pode não existir).");
    }

    // 2. Anonymize User Data (DB Logic)
    // Isso garante que o histórico financeiro seja mantido mas os dados pessoais removidos.
    // Também desvincula o usuario (auth_uid = NULL) para que o deleteUser abaixo não apague o registro público via cascade.
    const { error: rpcError } = await supabaseAdmin.rpc('anonymize_user_account', {
        target_user_id: usuarioId
    });

    if (rpcError) {
        logger.error({ error: rpcError.message, usuarioId }, "Falha ao anonimizar usuário no DB.");
        throw new AppError("Erro ao processar exclusão de dados.", 500);
    }

    // 3. Delete Auth User (Remove Login)
    // Como o auth_uid foi setado para NULL no passo anterior, o CASCADE não deve apagar o registro anonimizado.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(authUid);
    
    if (error) {
        logger.error({ error: error.message, usuarioId }, "Erro ao excluir usuário no Supabase Auth.");
        // Não lançar erro aqui pois o usuário já foi anonimizado/inutilizado.
        // throw new AppError(`Erro ao excluir conta: ${error.message}`, 500);
    }

    return { success: true };
}
