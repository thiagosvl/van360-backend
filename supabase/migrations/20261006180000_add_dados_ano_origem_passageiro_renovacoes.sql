-- Migration: 20261006180000_add_dados_ano_origem_passageiro_renovacoes.sql
-- Adiciona snapshot imutável dos dados cadastrais e operacionais do aluno antes da virada

ALTER TABLE passageiro_renovacoes
ADD COLUMN IF NOT EXISTS dados_ano_origem jsonb DEFAULT NULL;

COMMENT ON COLUMN passageiro_renovacoes.dados_ano_origem IS 'Snapshot imutável dos dados cadastrais e financeiros do passageiro no ano de origem antes da virada de ano letivo.';
