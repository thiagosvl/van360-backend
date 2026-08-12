-- Migration: Add isento column to passageiros table and allow NULL for financial fields
ALTER TABLE passageiros ADD COLUMN IF NOT EXISTS isento BOOLEAN NOT NULL DEFAULT FALSE;

-- Permitir NULL nos campos financeiros para passageiros isentos
ALTER TABLE passageiros ALTER COLUMN valor_cobranca DROP NOT NULL;
ALTER TABLE passageiros ALTER COLUMN dia_vencimento DROP NOT NULL;

-- Atualizar constraint de dia_vencimento para aceitar NULL ou 1..31
ALTER TABLE passageiros DROP CONSTRAINT IF EXISTS passageiros_dia_vencimento_check;
ALTER TABLE passageiros ADD CONSTRAINT passageiros_dia_vencimento_check CHECK (dia_vencimento IS NULL OR (dia_vencimento >= 1 AND dia_vencimento <= 31));
