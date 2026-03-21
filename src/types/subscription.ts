/**
 * Tipos e Interfaces do módulo de Assinaturas SaaS (Skeleton)
 * 
 * IMPORTANTE: Este módulo ainda NÃO está conectado a nenhum serviço real.
 * As interfaces aqui definem o contrato do ciclo de vida da assinatura do motorista.
 * 
 * Ciclo de Vida:
 *   TRIAL → ACTIVE → PAST_DUE → EXPIRED
 *                  ↘ CANCELED
 * 
 * Regras de negócio (imutáveis, independente do provider):
 * - Trial padrão: configurável via `configuracao_interna` (fallback 15 dias)
 * - Bloqueio ao expirar: somente visualização, sem cadastro/edição/remoção
 * - Notificações: X dias antes do vencimento, no dia, e após vencer
 */

import { SubscriptionStatus } from "./enums.js";

export interface SubscriptionRecord {
    id: string;
    usuarioId: string;
    status: SubscriptionStatus;
    plano: string;
    ciclo: "mensal" | "anual";
    metodoPagamento: "pix" | "cartao";
    valor: number;
    trialAte?: Date;
    vigenciaAte: Date;
    providerSubscriptionId?: string;
    providerName?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface SubscriptionTransition {
    from: SubscriptionStatus;
    to: SubscriptionStatus;
    reason: string;
    triggeredBy: "system" | "webhook" | "admin";
    timestamp: Date;
}
