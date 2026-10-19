-- Migration: Remover colunas legadas chave_pix e tipo_chave_pix da tabela usuarios
ALTER TABLE "public"."usuarios" 
  DROP COLUMN IF EXISTS "chave_pix",
  DROP COLUMN IF EXISTS "tipo_chave_pix";
