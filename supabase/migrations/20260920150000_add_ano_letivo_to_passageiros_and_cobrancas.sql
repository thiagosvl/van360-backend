ALTER TABLE "public"."passageiros" 
ADD COLUMN IF NOT EXISTS "ano_letivo" INTEGER;

UPDATE "public"."passageiros" 
SET "ano_letivo" = COALESCE(
  EXTRACT(YEAR FROM "data_inicio_cobranca")::integer,
  EXTRACT(YEAR FROM "created_at")::integer,
  EXTRACT(YEAR FROM CURRENT_DATE)::integer
) 
WHERE "ano_letivo" IS NULL;

ALTER TABLE "public"."passageiros" 
ALTER COLUMN "ano_letivo" SET DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::integer;

ALTER TABLE "public"."passageiros" 
ALTER COLUMN "ano_letivo" SET NOT NULL;

ALTER TABLE "public"."cobrancas" 
ADD COLUMN IF NOT EXISTS "ano_letivo" INTEGER;

UPDATE "public"."cobrancas" c 
SET "ano_letivo" = COALESCE(
  (SELECT p."ano_letivo" FROM "public"."passageiros" p WHERE p.id = c.passageiro_id),
  c.ano
) 
WHERE c."ano_letivo" IS NULL;

CREATE INDEX IF NOT EXISTS "idx_passageiros_ano_letivo" 
ON "public"."passageiros"("usuario_id", "ano_letivo");

CREATE INDEX IF NOT EXISTS "idx_cobrancas_ano_letivo" 
ON "public"."cobrancas"("usuario_id", "ano_letivo");
