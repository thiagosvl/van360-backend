-- Migration: Adiciona período de cobrança de mensalidades nos passageiros
-- Criada em: 2026-07-14

-- 1. Adicionar colunas temporariamente permitindo NULL
ALTER TABLE "public"."passageiros" ADD COLUMN IF NOT EXISTS "data_inicio_cobranca" DATE;
ALTER TABLE "public"."passageiros" ADD COLUMN IF NOT EXISTS "data_fim_cobranca" DATE;

-- 2. Preencher dados existentes herdando do transporte ou usando datas com base em created_at
UPDATE "public"."passageiros" SET
  "data_inicio_cobranca" = COALESCE("data_inicio_transporte", date_trunc('month', "created_at")::date),
  "data_fim_cobranca" = COALESCE("data_fim_transporte", (date_trunc('year', "created_at") + interval '11 months' + interval '30 days')::date)
WHERE "data_inicio_cobranca" IS NULL OR "data_fim_cobranca" IS NULL;

-- 3. Aplicar restrição NOT NULL agora que todos os dados foram preenchidos
ALTER TABLE "public"."passageiros" ALTER COLUMN "data_inicio_cobranca" SET NOT NULL;
ALTER TABLE "public"."passageiros" ALTER COLUMN "data_fim_cobranca" SET NOT NULL;
