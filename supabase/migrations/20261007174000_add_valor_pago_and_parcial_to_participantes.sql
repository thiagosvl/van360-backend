-- Migration: 20261007174000_add_valor_pago_and_parcial_to_participantes.sql
-- Adiciona suporte a pagamento parcial/sinal e coluna valor_pago

ALTER TYPE public.participante_pagamento_status_enum ADD VALUE IF NOT EXISTS 'parcial';

ALTER TABLE public.fretamento_participantes
ADD COLUMN IF NOT EXISTS valor_pago numeric(10,2) NOT NULL DEFAULT 0;

UPDATE public.fretamento_participantes
SET valor_pago = valor
WHERE status_pagamento = 'pago' AND valor_pago = 0;
