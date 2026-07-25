ALTER TABLE "public"."gastos"
    ADD COLUMN IF NOT EXISTS "parcelamento_id" "uuid",
    ADD COLUMN IF NOT EXISTS "numero_parcela" integer,
    ADD COLUMN IF NOT EXISTS "total_parcelas" integer;

CREATE INDEX IF NOT EXISTS "idx_gastos_parcelamento_id" ON "public"."gastos"("parcelamento_id");
