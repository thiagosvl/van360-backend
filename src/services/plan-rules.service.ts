import { PLANO_PROFISSIONAL } from "../config/constants.js";

/**
 * Centralized Rules for Plan Capabilities.
 * This is the SINGLE SOURCE OF TRUTH for what each plan can do.
 */
export const planRules = {
  /**
   * Verifica se o plano permite geração de PIX/Cobrança via Inter.
   * Regra: Apenas Profissional.
   */
  canGeneratePix: (planSlug: string): boolean => {
    return planSlug === PLANO_PROFISSIONAL;
  },

  /**
   * Verifica se o plano permite cobrança automática (mensalidade recorrente).
   * Regra: Apenas Profissional.
   */
  hasAutomatedBilling: (planSlug: string): boolean => {
    return planSlug === PLANO_PROFISSIONAL;
  },

  /**
   * Verifica se o plano permite notificações via WhatsApp.
   * Regra: Apenas Profissional.
   */
  hasWhatsAppNotifications: (planSlug: string): boolean => {
    return planSlug === PLANO_PROFISSIONAL;
  },
};
