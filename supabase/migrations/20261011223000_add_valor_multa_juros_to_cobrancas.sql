-- Migration para registrar valores decompostos de multa e juros em cobranças
ALTER TABLE public.cobrancas
ADD COLUMN IF NOT EXISTS valor_multa NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS valor_juros NUMERIC(10,2) DEFAULT 0;
