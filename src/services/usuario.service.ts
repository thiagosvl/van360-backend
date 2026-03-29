import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import { AtividadeAcao, AtividadeEntidadeTipo } from "../types/enums.js";
import { cleanString, onlyDigits } from "../utils/string.utils.js";
import { historicoService } from "./historico.service.js";

/**
 * Helper para obter dados do usuário
 */
export async function getUsuarioData(usuarioId: string) {
  const { data: usuario, error } = await supabaseAdmin
    .from("usuarios")
    .select("id, nome, cpfcnpj, telefone, config_contrato")
    .eq("id", usuarioId)
    .single();

  if (error || !usuario) {
    throw new AppError("Usuário não encontrado.", 404);
  }

  return usuario;
}

export async function validarAcessoUsuario(authUid: string, targetUsuarioId: string): Promise<boolean> {
  return authUid === targetUsuarioId;
}

export async function atualizarUsuario(usuarioId: string, payload: {
  nome?: string;
  apelido?: string;
  telefone?: string;
  assinatura_digital_url?: string;
  config_contrato?: any;
}) {
  if (!usuarioId) throw new AppError("ID do usuário é obrigatório.", 400);

  const updates: any = { updated_at: new Date().toISOString() };
  if (payload.nome) updates.nome = cleanString(payload.nome, true);
  if (payload.apelido) updates.apelido = cleanString(payload.apelido, true);
  if (payload.telefone) updates.telefone = onlyDigits(payload.telefone);
  if (payload.assinatura_digital_url !== undefined) updates.assinatura_digital_url = payload.assinatura_digital_url;
  if (payload.config_contrato !== undefined) updates.config_contrato = payload.config_contrato;



  const { error } = await supabaseAdmin
    .from("usuarios")
    .update(updates)
    .eq("id", usuarioId);

  if (error) {
    throw new AppError(`Erro ao atualizar usuário: ${error.message}`, 500);
  }

  if (payload.nome || payload.apelido || payload.telefone) {
    // --- LOG DE AUDITORIA (PERFIL) ---
    historicoService.log({
      usuario_id: usuarioId,
      entidade_tipo: AtividadeEntidadeTipo.USUARIO,
      entidade_id: usuarioId,
      acao: AtividadeAcao.PERFIL_EDITADO,
      descricao: `Dados de perfil (nome/apelido/telefone) atualizados.`,
      meta: { campos: Object.keys(payload).filter(k => ['nome', 'apelido', 'telefone'].includes(k)) }
    });
  } else if (payload.config_contrato !== undefined) {
    // --- LOG DE AUDITORIA (CONFIG CONTRATO) ---
    const config = payload.config_contrato;
    historicoService.log({
      usuario_id: usuarioId,
      entidade_tipo: AtividadeEntidadeTipo.USUARIO,
      entidade_id: usuarioId,
      acao: AtividadeAcao.CONTRATO_CONFIG_EDITADA,
      descricao: `Configurações de contrato atualizadas (Usa contratos: ${config.usar_contratos ? 'Sim' : 'Não'}).`,
      meta: {
        usar_contratos: config.usar_contratos,
        multa_atraso: config.multa_atraso,
        multa_rescisao: config.multa_rescisao,
        // Armazena as chaves que foram alteradas para facilitar auditoria rápida
        campos_alterados: Object.keys(config)
      }
    });
  }

  return { success: true };
}

