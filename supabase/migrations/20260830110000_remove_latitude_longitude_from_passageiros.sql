-- Remove colunas de latitude e longitude não utilizadas da tabela de passageiros
ALTER TABLE "public"."passageiros"
DROP COLUMN IF EXISTS "latitude",
DROP COLUMN IF EXISTS "longitude";
