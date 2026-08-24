-- 1. Adiciona coluna ano_letivo nas tabelas passageiros e pre_passageiros
ALTER TABLE "public"."passageiros" 
ADD COLUMN IF NOT EXISTS "ano_letivo" integer NOT NULL DEFAULT 2026;

ALTER TABLE "public"."pre_passageiros" 
ADD COLUMN IF NOT EXISTS "ano_letivo" integer NOT NULL DEFAULT 2026;

CREATE INDEX IF NOT EXISTS "idx_passageiros_usuario_ano" 
ON "public"."passageiros"("usuario_id", "ano_letivo");

-- 2. Enums para Renovação
DO $$ BEGIN
    CREATE TYPE "public"."renovacao_status_enum" AS ENUM (
        'pendente',
        'confirmado',
        'recusado',
        'concluido'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Tabela de Gestão de Renovações e Reservas Anuais
CREATE TABLE IF NOT EXISTS "public"."passageiro_renovacoes" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "usuario_id" uuid NOT NULL REFERENCES "public"."usuarios"("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "passageiro_id" uuid NOT NULL REFERENCES "public"."passageiros"("id") ON UPDATE CASCADE ON DELETE CASCADE,
    
    "ano_origem" integer NOT NULL DEFAULT 2026,
    "ano_destino" integer NOT NULL DEFAULT 2027,
    
    "status" "public"."renovacao_status_enum" DEFAULT 'pendente'::"public"."renovacao_status_enum" NOT NULL,
    
    -- Dados Propostos para o Novo Ano (Destino)
    "novo_valor_cobranca" numeric(10,2),
    "novo_dia_vencimento" integer,
    "nova_escola_id" uuid REFERENCES "public"."escolas"("id") ON UPDATE CASCADE ON DELETE SET NULL,
    "novo_periodo" text,
    "nova_modalidade" "public"."modalidade_enum",
    "nova_turma" text,
    "novo_nome_professor" text,
    "nova_data_inicio_transporte" date,
    "nova_data_fim_transporte" date,
    "nova_data_inicio_cobranca" date,
    "nova_data_fim_cobranca" date,
    "novo_veiculo_id" uuid REFERENCES "public"."veiculos"("id") ON UPDATE CASCADE ON DELETE SET NULL,
    
    -- Notificação e Autoatendimento
    "notificacao_enviada_em" timestamp with time zone,
    "token_publico" text UNIQUE,
    "confirmado_em" timestamp with time zone,
    
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    
    CONSTRAINT "unique_passageiro_ano_renovacao" UNIQUE ("passageiro_id", "ano_destino")
);

-- 4. Trigger de updated_at para passageiro_renovacoes
CREATE OR REPLACE TRIGGER "update_passageiro_renovacoes_updated_at" 
BEFORE UPDATE ON "public"."passageiro_renovacoes" 
FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

-- 5. Índices de Alta Performance
CREATE INDEX IF NOT EXISTS "idx_renovacoes_usuario_status" 
ON "public"."passageiro_renovacoes"("usuario_id", "status");

CREATE INDEX IF NOT EXISTS "idx_renovacoes_passageiro_ano" 
ON "public"."passageiro_renovacoes"("passageiro_id", "ano_destino");

CREATE INDEX IF NOT EXISTS "idx_renovacoes_token" 
ON "public"."passageiro_renovacoes"("token_publico");

-- 6. Row Level Security (RLS)
ALTER TABLE "public"."passageiro_renovacoes" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Motoristas podem gerenciar suas proprias renovacoes"
ON "public"."passageiro_renovacoes"
FOR ALL
TO authenticated
USING (usuario_id = auth.uid())
WITH CHECK (usuario_id = auth.uid());

CREATE POLICY "Acesso publico para consulta de renovacao por token"
ON "public"."passageiro_renovacoes"
FOR SELECT
TO anon, authenticated
USING (token_publico IS NOT NULL);

CREATE POLICY "Acesso publico para atualizacao de renovacao por token"
ON "public"."passageiro_renovacoes"
FOR UPDATE
TO anon, authenticated
USING (token_publico IS NOT NULL)
WITH CHECK (token_publico IS NOT NULL);

GRANT ALL ON TABLE "public"."passageiro_renovacoes" TO anon, authenticated, service_role;
