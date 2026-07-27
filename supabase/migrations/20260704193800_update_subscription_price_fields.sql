-- Migration: Update subscription price fields
-- Description: Renames the base price fields to monthly and adds annual price fields.

-- 1. Rename existing columns
ALTER TABLE public.assinaturas
RENAME COLUMN valor_base TO valor_base_mensal;

ALTER TABLE public.assinaturas
RENAME COLUMN valor_promocional TO valor_promocional_mensal;

-- 2. Add new columns for Annual Plan
ALTER TABLE public.assinaturas
ADD COLUMN valor_base_anual NUMERIC(10,2),
ADD COLUMN valor_promocional_anual NUMERIC(10,2);

-- 3. Backfill: Update valor_base_anual and valor_promocional_anual for ALL existing subscriptions 
-- using the Annual plan's current vitrine value.
UPDATE public.assinaturas
SET 
  valor_base_anual = (SELECT valor FROM public.planos WHERE identificador = 'YEARLY' LIMIT 1),
  valor_promocional_anual = (SELECT valor_promocional FROM public.planos WHERE identificador = 'YEARLY' LIMIT 1);
