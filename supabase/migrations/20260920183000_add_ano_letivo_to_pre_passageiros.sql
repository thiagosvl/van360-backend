ALTER TABLE "public"."pre_passageiros" 
ADD COLUMN IF NOT EXISTS "ano_letivo" INTEGER;

UPDATE "public"."pre_passageiros" 
SET "ano_letivo" = COALESCE(
  EXTRACT(YEAR FROM "data_inicio_cobranca")::integer,
  EXTRACT(YEAR FROM "created_at")::integer,
  EXTRACT(YEAR FROM CURRENT_DATE)::integer
) 
WHERE "ano_letivo" IS NULL;

ALTER TABLE "public"."pre_passageiros" 
ALTER COLUMN "ano_letivo" SET DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::integer;

ALTER TABLE "public"."pre_passageiros" 
ALTER COLUMN "ano_letivo" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_pre_passageiros_ano_letivo" 
ON "public"."pre_passageiros"("usuario_id", "ano_letivo");
