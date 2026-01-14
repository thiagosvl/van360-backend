-- Migration to add pairing code columns for better persistence and expiration tracking
ALTER TABLE "public"."usuarios" 
ADD COLUMN IF NOT EXISTS "pairing_code" VARCHAR(8),
ADD COLUMN IF NOT EXISTS "pairing_code_generated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS "pairing_code_expires_at" TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS "pairing_code_attempts" INT DEFAULT 0;

-- Index for expiring codes efficiently
CREATE INDEX IF NOT EXISTS "idx_usuarios_pairing_code_expires_at" 
ON "public"."usuarios" ("pairing_code_expires_at");

COMMENT ON COLUMN "public"."usuarios"."pairing_code" IS 'Evolution API Pairing Code (8 chars)';
