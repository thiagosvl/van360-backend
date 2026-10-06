-- Migration: Adicionar suporte a Multa e Juros por atraso nas configurações financeiras do motorista
-- Timestamp: 20261005231000

ALTER TABLE public.motorista_configuracoes_financeiras
    ADD COLUMN IF NOT EXISTS cobrar_multa_atraso BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS multa_atraso_tipo VARCHAR(20) DEFAULT 'percentual',
    ADD COLUMN IF NOT EXISTS multa_atraso_valor NUMERIC(10,2) DEFAULT 2.00,
    ADD COLUMN IF NOT EXISTS cobrar_juros_atraso BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS juros_atraso_tipo VARCHAR(20) DEFAULT 'percentual',
    ADD COLUMN IF NOT EXISTS juros_atraso_valor NUMERIC(10,2) DEFAULT 1.00,
    ADD COLUMN IF NOT EXISTS dias_carencia_atraso INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS dias_validade_apos_vencimento INTEGER NOT NULL DEFAULT 30;
