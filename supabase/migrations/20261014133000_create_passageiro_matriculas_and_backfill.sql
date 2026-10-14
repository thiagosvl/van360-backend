CREATE TABLE IF NOT EXISTS "public"."passageiro_matriculas" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "usuario_id" uuid NOT NULL REFERENCES "public"."usuarios"("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "passageiro_id" uuid NOT NULL REFERENCES "public"."passageiros"("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "ano_letivo" integer NOT NULL DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer,
    "ativo" boolean NOT NULL DEFAULT true,
    "escola_id" uuid NOT NULL REFERENCES "public"."escolas"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
    "veiculo_id" uuid NOT NULL REFERENCES "public"."veiculos"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
    "periodo" text,
    "modalidade" "public"."modalidade_enum",
    "turma" text,
    "sala" text,
    "nome_professor" text,
    "horario_entrada" text,
    "horario_saida" text,
    "valor_cobranca" numeric(10,2),
    "dia_vencimento" integer,
    "isento" boolean NOT NULL DEFAULT false,
    "modo_cobranca" "public"."modo_cobranca_enum",
    "data_inicio_transporte" date,
    "data_fim_transporte" date,
    "data_inicio_cobranca" date,
    "data_fim_cobranca" date,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "unique_passageiro_ano_matricula" UNIQUE ("passageiro_id", "ano_letivo"),
    CONSTRAINT "passageiro_matriculas_dia_vencimento_check" CHECK (((dia_vencimento IS NULL) OR ((dia_vencimento >= 1) AND (dia_vencimento <= 31))))
);

CREATE OR REPLACE TRIGGER "update_passageiro_matriculas_updated_at"
BEFORE UPDATE ON "public"."passageiro_matriculas"
FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE INDEX IF NOT EXISTS "idx_passageiro_matriculas_usuario_ano"
ON "public"."passageiro_matriculas" ("usuario_id", "ano_letivo");

CREATE INDEX IF NOT EXISTS "idx_passageiro_matriculas_passageiro_id"
ON "public"."passageiro_matriculas" ("passageiro_id");

CREATE INDEX IF NOT EXISTS "idx_passageiro_matriculas_escola_id"
ON "public"."passageiro_matriculas" ("escola_id");

CREATE INDEX IF NOT EXISTS "idx_passageiro_matriculas_veiculo_id"
ON "public"."passageiro_matriculas" ("veiculo_id");

CREATE INDEX IF NOT EXISTS "idx_passageiro_matriculas_cobranca_vigencia"
ON "public"."passageiro_matriculas" ("usuario_id", "ativo", "data_inicio_cobranca", "data_fim_cobranca");

ALTER TABLE "public"."passageiro_matriculas" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."passageiro_matriculas" TO anon, authenticated, service_role;

INSERT INTO "public"."passageiro_matriculas" (
    "usuario_id",
    "passageiro_id",
    "ano_letivo",
    "ativo",
    "escola_id",
    "veiculo_id",
    "periodo",
    "modalidade",
    "turma",
    "sala",
    "nome_professor",
    "horario_entrada",
    "horario_saida",
    "valor_cobranca",
    "dia_vencimento",
    "isento",
    "modo_cobranca",
    "data_inicio_transporte",
    "data_fim_transporte",
    "data_inicio_cobranca",
    "data_fim_cobranca",
    "created_at",
    "updated_at"
)
SELECT
    p."usuario_id",
    p."id",
    p."ano_letivo",
    p."ativo",
    p."escola_id",
    p."veiculo_id",
    p."periodo",
    p."modalidade",
    p."turma",
    p."sala",
    p."nome_professor",
    p."horario_entrada",
    p."horario_saida",
    p."valor_cobranca",
    p."dia_vencimento",
    p."isento",
    p."modo_cobranca",
    p."data_inicio_transporte",
    p."data_fim_transporte",
    p."data_inicio_cobranca",
    p."data_fim_cobranca",
    p."created_at",
    p."updated_at"
FROM "public"."passageiros" p
ON CONFLICT ("passageiro_id", "ano_letivo") DO NOTHING;

ALTER TABLE "public"."passageiro_renovacoes"
  ADD COLUMN IF NOT EXISTS "nova_sala" text,
  ADD COLUMN IF NOT EXISTS "novo_isento" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "motivo_recusa" text,
  ADD COLUMN IF NOT EXISTS "justificativa_recusa" text,
  ADD COLUMN IF NOT EXISTS "recusado_em" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "quem_recusou" text,
  ADD COLUMN IF NOT EXISTS "ip_confirmacao" text,
  ADD COLUMN IF NOT EXISTS "user_agent_confirmacao" text,
  ADD COLUMN IF NOT EXISTS "observacoes_pais" text,
  DROP COLUMN IF EXISTS "dados_ano_origem";

UPDATE "public"."passageiro_renovacoes"
SET "status" = 'confirmado'
WHERE "status" = 'concluido';

INSERT INTO "public"."passageiro_matriculas" (
    "usuario_id",
    "passageiro_id",
    "ano_letivo",
    "ativo",
    "escola_id",
    "veiculo_id",
    "periodo",
    "modalidade",
    "turma",
    "sala",
    "nome_professor",
    "horario_entrada",
    "horario_saida",
    "valor_cobranca",
    "dia_vencimento",
    "isento",
    "modo_cobranca",
    "data_inicio_transporte",
    "data_fim_transporte",
    "data_inicio_cobranca",
    "data_fim_cobranca"
)
SELECT
    r."usuario_id",
    r."passageiro_id",
    r."ano_destino",
    true,
    COALESCE(r."nova_escola_id", p."escola_id"),
    COALESCE(r."novo_veiculo_id", p."veiculo_id"),
    COALESCE(r."novo_periodo", p."periodo"),
    COALESCE(r."nova_modalidade", p."modalidade"),
    COALESCE(r."nova_turma", p."turma"),
    COALESCE(r."nova_sala", p."sala"),
    COALESCE(r."novo_nome_professor", p."nome_professor"),
    p."horario_entrada",
    p."horario_saida",
    CASE WHEN COALESCE(r."novo_isento", p."isento") THEN null ELSE COALESCE(r."novo_valor_cobranca", p."valor_cobranca") END,
    CASE WHEN COALESCE(r."novo_isento", p."isento") THEN null ELSE COALESCE(r."novo_dia_vencimento", p."dia_vencimento") END,
    COALESCE(r."novo_isento", p."isento"),
    p."modo_cobranca",
    COALESCE(r."nova_data_inicio_transporte", (p."data_inicio_transporte" + ((r."ano_destino" - r."ano_origem") * INTERVAL '1 year'))::date),
    COALESCE(r."nova_data_fim_transporte", (p."data_fim_transporte" + ((r."ano_destino" - r."ano_origem") * INTERVAL '1 year'))::date),
    COALESCE(r."nova_data_inicio_cobranca", (p."data_inicio_cobranca" + ((r."ano_destino" - r."ano_origem") * INTERVAL '1 year'))::date),
    COALESCE(r."nova_data_fim_cobranca", (p."data_fim_cobranca" + ((r."ano_destino" - r."ano_origem") * INTERVAL '1 year'))::date)
FROM "public"."passageiro_renovacoes" r
JOIN "public"."passageiros" p ON p."id" = r."passageiro_id"
WHERE r."status" = 'confirmado'
ON CONFLICT ("passageiro_id", "ano_letivo") DO NOTHING;
