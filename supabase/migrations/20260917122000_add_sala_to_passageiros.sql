ALTER TABLE "passageiros"
ADD COLUMN IF NOT EXISTS "sala" text;

ALTER TABLE "pre_passageiros"
ADD COLUMN IF NOT EXISTS "sala" text;
