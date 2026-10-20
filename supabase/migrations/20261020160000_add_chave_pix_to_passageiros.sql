ALTER TABLE "public"."passageiros" 
  ADD COLUMN IF NOT EXISTS "chave_pix" text,
  ADD COLUMN IF NOT EXISTS "tipo_chave_pix" text;

COMMENT ON COLUMN "public"."passageiros"."chave_pix" IS 'Chave Pix individual opcional do aluno (sobrepõe veículo e conta)';
COMMENT ON COLUMN "public"."passageiros"."tipo_chave_pix" IS 'Tipo da chave Pix individual do aluno';
