-- Migration: Adicionar informacoes do pagador Pix na tabela cobrancas_repasses
ALTER TABLE "public"."cobrancas_repasses"
  ADD COLUMN IF NOT EXISTS "pagador_nome" text NULL,
  ADD COLUMN IF NOT EXISTS "pagador_documento" text NULL,
  ADD COLUMN IF NOT EXISTS "pagador_banco" text NULL;

COMMENT ON COLUMN "public"."cobrancas_repasses"."pagador_nome" IS 'Nome do titular da conta bancaria que efetuou a transferencia Pix';
COMMENT ON COLUMN "public"."cobrancas_repasses"."pagador_documento" IS 'CPF ou CNPJ do titular da conta bancaria que efetuou a transferencia Pix';
COMMENT ON COLUMN "public"."cobrancas_repasses"."pagador_banco" IS 'Identificacao da instituicao financeira ou banco pagador';

CREATE INDEX IF NOT EXISTS "idx_cobrancas_repasses_pagador_nome" ON "public"."cobrancas_repasses" ("pagador_nome");
CREATE INDEX IF NOT EXISTS "idx_cobrancas_repasses_pagador_documento" ON "public"."cobrancas_repasses" ("pagador_documento");
