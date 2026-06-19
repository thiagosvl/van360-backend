-- Migration: Add subscription price fields
-- Description: Adiciona campos para controle de congelamento de preço e descontos nas assinaturas.

ALTER TABLE public.assinaturas
ADD COLUMN valor_base NUMERIC(10,2),
ADD COLUMN valor_promocional NUMERIC(10,2),
ADD COLUMN data_fim_promocao TIMESTAMPTZ;

-- Atualiza todas as assinaturas existentes para terem o valor_base igual ao valor do plano atual
-- Se a promoção global estiver ativa, a gente tenta pegar o valor promocional do plano? Sim.
-- No banco podemos só dar um UPDATE básico usando JOIN na tabela de planos.

UPDATE public.assinaturas a
SET valor_base = p.valor
FROM public.planos p
WHERE a.plano_id = p.id;
