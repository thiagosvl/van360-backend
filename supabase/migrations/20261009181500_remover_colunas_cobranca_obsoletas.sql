-- Migration: Remover colunas e tipos obsoletos de cobrança (substituídos por modo_cobranca)
-- Data: 2026-10-09

ALTER TABLE public.motorista_configuracoes_financeiras
    DROP COLUMN IF EXISTS modalidade_cobranca,
    DROP COLUMN IF EXISTS cobranca_automatica_ativa;

DROP TYPE IF EXISTS public.modalidade_cobranca_enum CASCADE;
