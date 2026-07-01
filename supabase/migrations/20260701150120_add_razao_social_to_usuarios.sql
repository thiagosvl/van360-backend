-- Adiciona coluna razao_social na tabela usuarios
ALTER TABLE "public"."usuarios" ADD COLUMN IF NOT EXISTS "razao_social" text NULL;
