-- Migration: Remover coluna obsoleta notificar_pais_cobrancas (substituída por modo_cobranca)
-- Data: 2026-10-09

ALTER TABLE public.usuario_configuracoes
    DROP COLUMN IF EXISTS notificar_pais_cobrancas;
