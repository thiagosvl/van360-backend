import { PLANO_ESSENCIAL, PLANO_PROFISSIONAL } from "../config/constants.js";
import { AssinaturaStatus } from "../types/enums.js";

export interface PlanFlags {
  is_trial_ativo: boolean;
  is_trial_valido: boolean;
  dias_restantes_trial: number | null;
  dias_restantes_assinatura: number | null;
  is_plano_valido: boolean;
  is_read_only: boolean;
  is_ativo: boolean;
  is_pendente: boolean;
  is_suspensa: boolean;
  is_cancelada: boolean;
  is_profissional: boolean;
  is_essencial: boolean;
}

/**
 * Calcula todas as flags de estado do plano a partir dos dados de assinatura.
 */
export function calculatePlanFlags(assinatura: any): PlanFlags {
  const now = new Date();
  const status = assinatura?.status;
  const ativo = assinatura?.ativo;
  const pgtoStatus = assinatura?.status_pagamento; // Se existir no objeto

  const isTrial = status === AssinaturaStatus.TRIAL;
  const slugPlano = assinatura?.planos?.parent?.slug || assinatura?.planos?.slug;

  // 1. Cálculos de Datas
  let diasRestantesTrial: number | null = null;
  if (isTrial && assinatura?.trial_end_at) {
    const end = new Date(assinatura.trial_end_at);
    diasRestantesTrial = Math.ceil((end.getTime() - now.getTime()) / (1000 * 3600 * 24));
    if (diasRestantesTrial < 0) diasRestantesTrial = 0;
  }

  let diasRestantesAssinatura: number | null = null;
  if (assinatura?.vigencia_fim) {
    const end = new Date(assinatura.vigencia_fim);
    diasRestantesAssinatura = Math.ceil((end.getTime() - now.getTime()) / (1000 * 3600 * 24));
    if (diasRestantesAssinatura < 0) diasRestantesAssinatura = 0;
  }

  // 2. Flags de Estado
  const is_trial_valido = isTrial && (diasRestantesTrial ?? 0) >= 0;
  const is_ativo = status === AssinaturaStatus.ATIVA && ativo === true;
  const is_pendente = status === AssinaturaStatus.PENDENTE_PAGAMENTO;
  const is_suspensa = status === AssinaturaStatus.SUSPENSA;
  const is_cancelada = status === AssinaturaStatus.CANCELADA;

  // 3. Flags de Acesso (BUSINESS LOGIC)
  const is_plano_valido = is_ativo || is_trial_valido || is_suspensa;
  const is_read_only = is_suspensa;

  // 4. Flags de Plano Específico
  const is_profissional = slugPlano === PLANO_PROFISSIONAL;
  const is_essencial = slugPlano === PLANO_ESSENCIAL;

  return {
    is_trial_ativo: isTrial,
    is_trial_valido,
    dias_restantes_trial: diasRestantesTrial,
    dias_restantes_assinatura: diasRestantesAssinatura,
    is_plano_valido,
    is_read_only,
    is_ativo,
    is_pendente,
    is_suspensa,
    is_cancelada,
    is_profissional,
    is_essencial,
  };
}
