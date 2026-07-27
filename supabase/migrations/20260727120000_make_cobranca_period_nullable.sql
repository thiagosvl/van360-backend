-- Migration: Permite NULL para período de cobrança nos passageiros
-- Criada em: 2026-07-27

ALTER TABLE "public"."passageiros" ALTER COLUMN "data_inicio_cobranca" DROP NOT NULL;
ALTER TABLE "public"."passageiros" ALTER COLUMN "data_fim_cobranca" DROP NOT NULL;
