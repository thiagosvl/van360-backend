-- Adiciona o campo turma nas tabelas relacionadas a passageiros

ALTER TABLE "public"."passageiros" 
ADD COLUMN IF NOT EXISTS "turma" text;

ALTER TABLE "public"."pre_passageiros" 
ADD COLUMN IF NOT EXISTS "turma" text;
