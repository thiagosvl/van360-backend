import {
    PLANO_ESSENCIAL,
    PLANO_PROFISSIONAL
} from "../config/constants.js";
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import { AssinaturaCobrancaStatus, AssinaturaStatus } from "../types/enums.js";

// TODO: Definir interface AssinaturaUsuario estrita no futuro
export interface AssinaturaUsuario {
    id: string;
    usuario_id: string;
    plano_id: string;
    status: string;
    ativo: boolean;
    created_at: string;
    planos?: any; // Expansão do plano
    cancelamento_manual?: string | null;
    status_anterior?: string | null;
    updated_at?: string;
    anchor_date?: string;
    vigencia_fim?: string | null;
    preco_aplicado?: number;
    franquia_contratada_cobrancas?: number;
    trial_end_at?: string | null;
}

export async function getAssinaturaAtiva(usuarioId: string): Promise<AssinaturaUsuario> {
  const { data: assinaturas, error } = await supabaseAdmin
    .from("assinaturas_usuarios")
    .select(`
      *,
      planos:plano_id (*, parent:parent_id (*))
    `)
    .eq("usuario_id", usuarioId)
    .eq("ativo", true);

  if (error) {
    logger.error({ error: error.message, usuarioId }, "Erro ao buscar assinatura ativa");
    throw new Error("Erro ao buscar assinatura ativa.");
  }

  if (!assinaturas || assinaturas.length === 0) {
    logger.warn({ usuarioId }, "Nenhuma assinatura ativa encontrada");
    throw new AppError("Assinatura ativa não encontrada.", 404);
  }

  // Se houver múltiplas, pegar a mais recente
  const assinatura = assinaturas.length > 1
    ? assinaturas.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    : assinaturas[0];

  return assinatura as AssinaturaUsuario;
}

export async function cancelarCobrancaPendente(usuarioId: string) {
  const { error } = await supabaseAdmin
    .from("assinaturas_cobrancas")
    .update({ status: AssinaturaCobrancaStatus.CANCELADA })
    .eq("usuario_id", usuarioId)
    .eq("status", AssinaturaCobrancaStatus.PENDENTE_PAGAMENTO);

  if (error) {
    logger.warn({ error: error.message, usuarioId }, "Erro ao cancelar cobrança pendente (pode não existir)");
  }
}

export async function limparAssinaturasPendentes(usuarioId: string) {
  try {
    // Buscar assinaturas pendentes
    const { data: assinaturasPendentes, error: findError } = await supabaseAdmin
      .from("assinaturas_usuarios")
      .select("id")
      .eq("usuario_id", usuarioId)
      .eq("status", AssinaturaStatus.PENDENTE_PAGAMENTO)
      .eq("ativo", false);

    if (findError) {
      logger.warn({ error: findError.message, usuarioId }, "Erro ao buscar assinaturas pendentes");
      return;
    }

    if (!assinaturasPendentes || assinaturasPendentes.length === 0) {
      return; // Nenhuma pendente para limpar
    }

    const assinaturaIds = assinaturasPendentes.map((a) => a.id);

    // Cancelar cobranças vinculadas
    await supabaseAdmin
      .from("assinaturas_cobrancas")
      .update({ status: AssinaturaCobrancaStatus.CANCELADA })
      .in("assinatura_usuario_id", assinaturaIds)
      .eq("status", AssinaturaCobrancaStatus.PENDENTE_PAGAMENTO);

    // Remover assinaturas pendentes
    const { error: deleteError } = await supabaseAdmin
      .from("assinaturas_usuarios")
      .delete()
      .in("id", assinaturaIds);

    if (deleteError) {
      logger.warn({ error: deleteError.message, usuarioId }, "Erro ao remover assinaturas pendentes");
    } else {
      logger.info({ usuarioId, quantidade: assinaturasPendentes.length }, "Assinaturas pendentes removidas");
    }
  } catch (err: any) {
    logger.warn({ error: err.message, usuarioId }, "Erro ao limpar assinaturas pendentes");
  }
}

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

export function isUpgrade(slugAtual: string, slugNovo: string): boolean {
  const ordem: Record<string, number> = {
    [PLANO_ESSENCIAL]: 2,
    [PLANO_PROFISSIONAL]: 3,
  };

  const ordemAtual = ordem[slugAtual] || 0;
  const ordemNova = ordem[slugNovo] || 0;

  return ordemNova >= ordemAtual;
}
