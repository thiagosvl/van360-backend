-- 1. Garante colunas de latitude e longitude na tabela de passageiros
ALTER TABLE "public"."passageiros" 
ADD COLUMN IF NOT EXISTS "latitude" numeric(10, 8),
ADD COLUMN IF NOT EXISTS "longitude" numeric(11, 8);

-- 2. Enums para execução de rota e paradas
DO $$ BEGIN
    CREATE TYPE "public"."execucao_rota_status_enum" AS ENUM ('iniciada', 'concluida', 'cancelada');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "public"."execucao_passageiro_status_enum" AS ENUM ('pendente', 'embarcado', 'ausente');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "public"."tipo_no_rota_enum" AS ENUM ('passageiro', 'escola');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Tabela Mestre de Rotas Estáticas (Configuração)
CREATE TABLE IF NOT EXISTS "public"."rotas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "usuario_id" "uuid" NOT NULL REFERENCES "public"."usuarios"("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "veiculo_id" "uuid" REFERENCES "public"."veiculos"("id") ON UPDATE CASCADE ON DELETE SET NULL,
    "nome" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

-- 4. Tabela de Sequenciamento / Associação de Paradas da Rota
CREATE TABLE IF NOT EXISTS "public"."rota_passageiros" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "rota_id" "uuid" NOT NULL REFERENCES "public"."rotas"("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "tipo_no" "public"."tipo_no_rota_enum" DEFAULT 'passageiro' NOT NULL,
    "passageiro_id" "uuid" REFERENCES "public"."passageiros"("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "escola_id" "uuid" REFERENCES "public"."escolas"("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "ordem" integer NOT NULL,
    "sentido" text CONSTRAINT check_sentido_estatico CHECK (sentido IN ('indo', 'voltando')),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

-- 5. Tabela de Ausências Agendadas (Por Data e Turno)
CREATE TABLE IF NOT EXISTS "public"."passageiro_ausencias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "passageiro_id" "uuid" NOT NULL REFERENCES "public"."passageiros"("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "data_ausencia" date NOT NULL,
    "turno" "text" NOT NULL, -- 'manha', 'tarde', 'noite', 'integral'
    "sentido" text CONSTRAINT check_sentido_ausencia CHECK (sentido IN ('indo', 'voltando')), -- 'indo', 'voltando', NULL para ambos
    "motivo" "text",
    "registrado_por" "uuid" REFERENCES "public"."usuarios"("id") ON UPDATE CASCADE ON DELETE SET NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

-- 6. Tabela de Execução Diária da Rota (Histórico/Corrida Ativa no Dia)
CREATE TABLE IF NOT EXISTS "public"."execucoes_rota" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "rota_id" "uuid" NOT NULL REFERENCES "public"."rotas"("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "usuario_id" "uuid" NOT NULL REFERENCES "public"."usuarios"("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "status" "public"."execucao_rota_status_enum" DEFAULT 'iniciada'::"public"."execucao_rota_status_enum" NOT NULL,
    "iniciada_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finalizada_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

-- 7. Tabela de Status das Paradas da Execução da Rota do Dia
CREATE TABLE IF NOT EXISTS "public"."execucoes_rota_passageiros" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "execucao_rota_id" "uuid" NOT NULL REFERENCES "public"."execucoes_rota"("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "tipo_no" "public"."tipo_no_rota_enum" DEFAULT 'passageiro' NOT NULL,
    "passageiro_id" "uuid" REFERENCES "public"."passageiros"("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "escola_id" "uuid" REFERENCES "public"."escolas"("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "status" "public"."execucao_passageiro_status_enum" DEFAULT 'pendente'::"public"."execucao_passageiro_status_enum" NOT NULL,
    "ordem" integer NOT NULL,
    "sentido" text CONSTRAINT check_sentido_execucao CHECK (sentido IN ('indo', 'voltando')),
    "notificado_em" timestamp with time zone,
    "visitado_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

-- Trigger de atualização de updated_at para a tabela rotas
CREATE OR REPLACE TRIGGER "update_rotas_updated_at" BEFORE UPDATE ON "public"."rotas" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

-- Permissões RLS
ALTER TABLE "public"."rotas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."rota_passageiros" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."passageiro_ausencias" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."execucoes_rota" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."execucoes_rota_passageiros" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."rotas" TO anon, authenticated, service_role;
GRANT ALL ON TABLE "public"."rota_passageiros" TO anon, authenticated, service_role;
GRANT ALL ON TABLE "public"."passageiro_ausencias" TO anon, authenticated, service_role;
GRANT ALL ON TABLE "public"."execucoes_rota" TO anon, authenticated, service_role;
GRANT ALL ON TABLE "public"."execucoes_rota_passageiros" TO anon, authenticated, service_role;
