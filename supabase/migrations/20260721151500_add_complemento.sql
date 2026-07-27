-- Migration para adicionar a coluna `complemento` em tabelas que possuem endereços.

ALTER TABLE "public"."escolas" ADD COLUMN IF NOT EXISTS "complemento" text;
ALTER TABLE "public"."passageiros" ADD COLUMN IF NOT EXISTS "complemento" text;
ALTER TABLE "public"."pre_passageiros" ADD COLUMN IF NOT EXISTS "complemento" text;
ALTER TABLE "public"."passageiro_responsaveis_adicionais" ADD COLUMN IF NOT EXISTS "complemento" text;
