-- Migration: Adicionar coluna motivo_desativacao na tabela passageiros
-- Data: 2025-01-XX
-- Descrição: Adiciona coluna para rastrear se a desativação de cobranças automáticas foi manual ou automática

ALTER TABLE passageiros 
ADD COLUMN IF NOT EXISTS motivo_desativacao VARCHAR(20) DEFAULT NULL;

-- Criar índice para melhor performance em queries
CREATE INDEX IF NOT EXISTS idx_passageiros_motivo_desativacao 
ON passageiros(motivo_desativacao) 
WHERE motivo_desativacao IS NOT NULL;

-- Comentário na coluna
COMMENT ON COLUMN passageiros.motivo_desativacao IS 'Razão da desativação: manual (usuário desativou) ou automatico (sistema desativou por exceder franquia). NULL quando ativo.';

