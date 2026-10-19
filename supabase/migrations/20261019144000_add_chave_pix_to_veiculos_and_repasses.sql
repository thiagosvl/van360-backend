-- Migration: Adicionar chave_pix e tipo_chave_pix na tabela veiculos e chave_pix de snapshot em repasses e cobrancas
ALTER TABLE "public"."veiculos" 
  ADD COLUMN IF NOT EXISTS "chave_pix" text NULL,
  ADD COLUMN IF NOT EXISTS "tipo_chave_pix" text NULL;

ALTER TABLE "public"."cobrancas" 
  ADD COLUMN IF NOT EXISTS "chave_pix_repasse" text NULL;

ALTER TABLE "public"."cobrancas_repasses" 
  ADD COLUMN IF NOT EXISTS "chave_pix" text NULL;

COMMENT ON COLUMN "public"."veiculos"."chave_pix" IS 'Chave Pix especifica para cobrancas e repasses deste veiculo';
COMMENT ON COLUMN "public"."veiculos"."tipo_chave_pix" IS 'Tipo da chave Pix do veiculo (CPF, CNPJ, TELEFONE, EMAIL, ALEATORIA)';
COMMENT ON COLUMN "public"."cobrancas"."chave_pix_repasse" IS 'Snapshot da chave Pix utilizada no split da Woovi/provedor no momento da geracao';
COMMENT ON COLUMN "public"."cobrancas_repasses"."chave_pix" IS 'Snapshot da chave Pix de destino para realizacao do saque do repasse';
