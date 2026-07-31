-- Migration to fix indicacoes.indicado_id foreign key constraint.
-- Prevents deletion of earned referral reward records when an indicated user is deleted.

ALTER TABLE "public"."indicacoes"
  DROP CONSTRAINT IF EXISTS "indicacoes_indicado_id_fkey";

ALTER TABLE "public"."indicacoes"
  ALTER COLUMN "indicado_id" DROP NOT NULL;

ALTER TABLE "public"."indicacoes"
  ADD CONSTRAINT "indicacoes_indicado_id_fkey"
  FOREIGN KEY ("indicado_id") REFERENCES "public"."usuarios"("id")
  ON UPDATE CASCADE
  ON DELETE SET NULL;
