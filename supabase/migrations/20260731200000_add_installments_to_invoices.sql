-- Adiciona colunas para suporte a cobranças parceladas no cartão de crédito
ALTER TABLE "public"."assinatura_faturas"
ADD COLUMN IF NOT EXISTS "parcelas" integer DEFAULT 1 NOT NULL,
ADD COLUMN IF NOT EXISTS "valor_parcela" numeric,
ADD COLUMN IF NOT EXISTS "valor_total" numeric;
