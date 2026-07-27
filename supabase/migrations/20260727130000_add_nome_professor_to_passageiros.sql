-- Adiciona o campo nome_professor nas tabelas relacionadas a passageiros
ALTER TABLE "passageiros"
ADD COLUMN IF NOT EXISTS "nome_professor" text;

ALTER TABLE "pre_passageiros"
ADD COLUMN IF NOT EXISTS "nome_professor" text;
