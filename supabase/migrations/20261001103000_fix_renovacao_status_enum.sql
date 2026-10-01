-- Migration: Unifica e fixa os valores de renovacao_status_enum para pendente, confirmado, recusado e concluido
ALTER TABLE "public"."passageiro_renovacoes" 
ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "public"."passageiro_renovacoes" 
ALTER COLUMN "status" TYPE text;

UPDATE "public"."passageiro_renovacoes" 
SET "status" = 'confirmado' 
WHERE "status" IN ('confirmado_manual', 'confirmado_online');

UPDATE "public"."passageiro_renovacoes" 
SET "status" = 'recusado' 
WHERE "status" IN ('recusado_motorista', 'recusado_pais');

DROP TYPE IF EXISTS "public"."renovacao_status_enum";

CREATE TYPE "public"."renovacao_status_enum" AS ENUM (
    'pendente',
    'confirmado',
    'recusado',
    'concluido'
);

ALTER TABLE "public"."passageiro_renovacoes" 
ALTER COLUMN "status" TYPE "public"."renovacao_status_enum" 
USING ("status"::"public"."renovacao_status_enum");

ALTER TABLE "public"."passageiro_renovacoes" 
ALTER COLUMN "status" SET DEFAULT 'pendente'::"public"."renovacao_status_enum";
