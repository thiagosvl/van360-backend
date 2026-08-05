-- Migration: Tornar a coluna data_nascimento opcional na tabela usuarios para sub-contas
ALTER TABLE "public"."usuarios" ALTER COLUMN "data_nascimento" DROP NOT NULL;
