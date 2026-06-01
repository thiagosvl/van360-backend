-- 1. Garante que a tabela de Passageiros possui latitude e longitude para deeplinks precisos
ALTER TABLE "public"."passageiros" 
ADD COLUMN IF NOT EXISTS "latitude" numeric(10, 8),
ADD COLUMN IF NOT EXISTS "longitude" numeric(11, 8);

-- Enum para status da execução da rota
CREATE TYPE "public"."execucao_rota_status_enum" AS ENUM (
    'iniciada',
    'concluida',
    'cancelada'
);

-- Enum para status do passageiro na execução da rota
CREATE TYPE "public"."execucao_passageiro_status_enum" AS ENUM (
    'pendente',
    'a_caminho',
    'embarcado',
    'ausente'
);

-- 2. Tabela de Rotas Estáticas (Configuração)
CREATE TABLE IF NOT EXISTS "public"."rotas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "periodo" "text" NOT NULL, -- 'manha', 'tarde', 'noite'
    "tipo" "public"."modalidade_enum" NOT NULL, -- 'ida', 'volta'
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rotas_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rotas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON UPDATE CASCADE ON DELETE CASCADE
);

-- 3. Tabela de Sequenciamento / Associação de Passageiros na Rota
CREATE TABLE IF NOT EXISTS "public"."rota_passageiros" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rota_id" "uuid" NOT NULL,
    "passageiro_id" "uuid" NOT NULL,
    "ordem" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rota_passageiros_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rota_passageiros_rota_id_fkey" FOREIGN KEY ("rota_id") REFERENCES "public"."rotas"("id") ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT "rota_passageiros_passageiro_id_fkey" FOREIGN KEY ("passageiro_id") REFERENCES "public"."passageiros"("id") ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT "rota_passageiros_rota_id_passageiro_id_unique" UNIQUE ("rota_id", "passageiro_id")
);

-- 4. Tabela de Execução da Rota (Histórico/Corrida Ativa no Dia)
CREATE TABLE IF NOT EXISTS "public"."execucoes_rota" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rota_id" "uuid" NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "status" "public"."execucao_rota_status_enum" DEFAULT 'iniciada'::"public"."execucao_rota_status_enum" NOT NULL,
    "tipo" "public"."modalidade_enum" NOT NULL, -- 'ida', 'volta'
    "iniciada_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finalizada_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "execucoes_rota_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "execucoes_rota_rota_id_fkey" FOREIGN KEY ("rota_id") REFERENCES "public"."rotas"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT "execucoes_rota_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON UPDATE CASCADE ON DELETE CASCADE
);

-- 5. Tabela de Status dos Passageiros na Execução da Rota do Dia
CREATE TABLE IF NOT EXISTS "public"."execucoes_rota_passageiros" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "execucao_rota_id" "uuid" NOT NULL,
    "passageiro_id" "uuid" NOT NULL,
    "status" "public"."execucao_passageiro_status_enum" DEFAULT 'pendente'::"public"."execucao_passageiro_status_enum" NOT NULL,
    "ordem" integer NOT NULL,
    "notificado_em" timestamp with time zone,
    "visitado_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "execucoes_rota_passageiros_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "execucoes_rota_passageiros_execucao_rota_id_fkey" FOREIGN KEY ("execucao_rota_id") REFERENCES "public"."execucoes_rota"("id") ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT "execucoes_rota_passageiros_passageiro_id_fkey" FOREIGN KEY ("passageiro_id") REFERENCES "public"."passageiros"("id") ON UPDATE CASCADE ON DELETE CASCADE
);

-- Trigger de atualização automática de data para a tabela rotas
CREATE OR REPLACE TRIGGER "update_rotas_updated_at" BEFORE UPDATE ON "public"."rotas" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();
