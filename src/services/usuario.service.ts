import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import { getNowBR, parseBrazilianDateToISO } from "../utils/date.utils.js";
import { AtividadeAcao, AtividadeEntidadeTipo, TipoChavePix } from "../types/enums.js";
import { cleanString, onlyDigits } from "../utils/string.utils.js";
import { historicoService } from "./historico.service.js";
import { isValidPixKey } from "../utils/validators.js";

export async function getUsuarioData(usuarioId: string) {
  const { data: usuario, error } = await supabaseAdmin
    .from("usuarios")
    .select("id, nome, cpfcnpj, telefone, config_contrato, chave_pix, tipo_chave_pix, data_nascimento")
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
  data_nascimento?: string;
}) {
  if (!usuarioId) throw new AppError("ID do usuário é obrigatório.", 400);

  const updates: any = { updated_at: getNowBR().toISOString() };
  if (payload.nome) updates.nome = cleanString(payload.nome, true);
  if (payload.apelido) updates.apelido = cleanString(payload.apelido, true);
  if (payload.telefone) updates.telefone = onlyDigits(payload.telefone);
  if (payload.assinatura_digital_url !== undefined) updates.assinatura_digital_url = payload.assinatura_digital_url;
  if (payload.config_contrato !== undefined) updates.config_contrato = payload.config_contrato;

  if (payload.data_nascimento !== undefined) {
    updates.data_nascimento = parseBrazilianDateToISO(payload.data_nascimento);
  }

  const { error } = await supabaseAdmin
    .from("usuarios")
    .update(updates)
    .eq("id", usuarioId);

  if (error) {
    throw new AppError(`Erro ao atualizar usuário: ${error.message}`, 500);
  }

  const perfilAlterado = payload.nome || payload.apelido || payload.telefone || payload.data_nascimento;

  if (perfilAlterado) {
    historicoService.log({
      usuario_id: usuarioId,
      entidade_tipo: AtividadeEntidadeTipo.USUARIO,
      entidade_id: usuarioId,
      acao: AtividadeAcao.PERFIL_EDITADO,
      descricao: "Dados de identificação do perfil (nome/apelido/telefone/data_nascimento) atualizados.",
      meta: { campos: Object.keys(payload).filter(k => ['nome', 'apelido', 'telefone', 'data_nascimento'].includes(k)) }
    });
  } else if (payload.config_contrato !== undefined) {
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
        campos_alterados: Object.keys(config)
      }
    });
  }

  return { success: true };
}

export async function atualizarPixUsuario(usuarioId: string, payload: {
  chave_pix: string | null;
  tipo_chave_pix: TipoChavePix | null;
}) {
  if (!usuarioId) throw new AppError("ID do usuário é obrigatório.", 400);

  const { chave_pix, tipo_chave_pix } = payload;

  if ((chave_pix && !tipo_chave_pix) || (!chave_pix && tipo_chave_pix)) {
    throw new AppError("A chave Pix e o tipo de chave Pix devem ser fornecidos juntos ou ambos nulos.", 400);
  }

  const { data: currentPixData } = await supabaseAdmin
    .from("usuarios")
    .select("chave_pix")
    .eq("id", usuarioId)
    .single();

  const updates: any = {
    updated_at: getNowBR().toISOString()
  };

  if (chave_pix && tipo_chave_pix) {
    const isValid = isValidPixKey(tipo_chave_pix, chave_pix);
    if (!isValid) {
      throw new AppError("Formato de chave Pix inválido para o tipo selecionado.", 400);
    }
    updates.chave_pix = chave_pix;
    updates.tipo_chave_pix = tipo_chave_pix;
  } else {
    updates.chave_pix = null;
    updates.tipo_chave_pix = null;
  }

  const { error } = await supabaseAdmin
    .from("usuarios")
    .update(updates)
    .eq("id", usuarioId);

  if (error) {
    throw new AppError(`Erro ao atualizar dados Pix do usuário: ${error.message}`, 500);
  }

  const isNewPix = !currentPixData?.chave_pix;
  const descricaoPix = updates.chave_pix 
    ? (isNewPix ? "Chave Pix de recebimento estática configurada pelo motorista." : "Chave Pix de recebimento estática atualizada pelo motorista.")
    : "Chave Pix de recebimento estática removida pelo motorista.";

  historicoService.log({
    usuario_id: usuarioId,
    entidade_tipo: AtividadeEntidadeTipo.USUARIO,
    entidade_id: usuarioId,
    acao: AtividadeAcao.PERFIL_EDITADO,
    descricao: descricaoPix,
    meta: { 
      tipo_chave_pix,
      chave_pix: updates.chave_pix ? "***" : null
    }
  });

  return { success: true };
}
