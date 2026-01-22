import { PLANO_ESSENCIAL, PLANO_PROFISSIONAL } from "../config/constants.js";

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

  /**
   * Verifica se o plano tem acesso a Relatórios Financeiros.
   * Regra: Essencial ou Profissional.
   */
  hasFinancialReports: (planSlug: string): boolean => {
    return isEssencialOrAbove(planSlug);
  },

  /**
   * Verifica se o plano tem acesso ao módulo de Gestão de Gastos.
   * Regra: Essencial ou Profissional.
   */
  hasExpenseManagement: (planSlug: string): boolean => {
    return isEssencialOrAbove(planSlug);
  },
  
  /**
   * Verifica se o plano pode usar o módulo Pre-Passageiro (Cadastro Rápido).
   * Regra: Todos os planos ativos (Essencial, Profissional).
   * (Mantendo explícito para futuro controle)
   */
  hasQuickRegister: (planSlug: string): boolean => {
    return true; 
  }
};

// Helper privado
function isEssencialOrAbove(slug: string) {
  return slug === PLANO_ESSENCIAL || slug === PLANO_PROFISSIONAL;
}
