-- Migration: Adicionar flag notificacoes_rota_habilitadas na tabela passageiro_responsaveis
-- Data: 2026-09-01

ALTER TABLE passageiro_responsaveis
ADD COLUMN IF NOT EXISTS notificacoes_rota_habilitadas BOOLEAN NOT NULL DEFAULT true;

-- Garantir que todos os registros existentes recebam true retroativamente
UPDATE passageiro_responsaveis
SET notificacoes_rota_habilitadas = true
WHERE notificacoes_rota_habilitadas IS NOT TRUE;
