-- Migration: Criar tabela rota_ausencias para registro de ausências antecipadas por rota
CREATE TABLE IF NOT EXISTS "public"."rota_ausencias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "rota_id" "uuid" NOT NULL REFERENCES "public"."rotas"("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "passageiro_id" "uuid" NOT NULL REFERENCES "public"."passageiros"("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "data_ausencia" date NOT NULL,
    "sentido" text CONSTRAINT check_sentido_rota_ausencia CHECK (sentido IN ('indo', 'voltando')),
    "registrado_por" "uuid" REFERENCES "public"."usuarios"("id") ON UPDATE CASCADE ON DELETE SET NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_rota_ausencias_lookup" 
  ON "public"."rota_ausencias" ("rota_id", "data_ausencia", "passageiro_id");
