-- Migration: Garantir que passageiros.modo_cobranca seja NULL por padrao (segue a regra geral do motorista)
-- Data: 2026-10-09

ALTER TABLE public.passageiros
    ALTER COLUMN modo_cobranca DROP NOT NULL,
    ALTER COLUMN modo_cobranca SET DEFAULT NULL;
