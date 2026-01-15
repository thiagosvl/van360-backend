

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "http" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."tipo_pagamento_enum" AS ENUM (
    'dinheiro',
    'cartao-credito',
    'cartao-debito',
    'transferencia',
    'PIX',
    'boleto'
);


ALTER TYPE "public"."tipo_pagamento_enum" OWNER TO "postgres";

CREATE TYPE "public"."billing_type_enum" AS ENUM (
    'subscription',
    'upgrade',
    'activation',
    'upgrade_plan',
    'expansion',
    'downgrade',
    'renewal'
);

ALTER TYPE "public"."billing_type_enum" OWNER TO "postgres";

CREATE TYPE "public"."whatsapp_status_enum" AS ENUM (
    'CONNECTED',
    'DISCONNECTED',
    'CONNECTING',
    'UNKNOWN',
    'NOT_FOUND'
);

ALTER TYPE "public"."whatsapp_status_enum" OWNER TO "postgres";

CREATE TYPE "public"."user_type_enum" AS ENUM (
    'admin',
    'motorista'
);

ALTER TYPE "public"."user_type_enum" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."app_updates" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "platform" "text" NOT NULL,
    "latest_version" "text" NOT NULL,
    "force_update" boolean DEFAULT false,
    "url_zip" "text" NOT NULL,
    "changelog" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    CONSTRAINT "app_updates_platform_check" CHECK (("platform" = ANY (ARRAY['android'::"text", 'ios'::"text"])))
);


ALTER TABLE "public"."app_updates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assinatura_notificacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assinatura_cobranca_id" "uuid",
    "tipo_evento" character varying(50) NOT NULL,
    "canal" character varying(20) DEFAULT 'WHATSAPP'::character varying,
    "data_envio" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "usuario_id" "uuid"
);


ALTER TABLE "public"."assinatura_notificacoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assinaturas_cobrancas" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "usuario_id" "uuid",
    "assinatura_usuario_id" "uuid",
    "valor" numeric(10,2) NOT NULL,
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "data_vencimento" "date" NOT NULL,
    "data_pagamento" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tipo_pagamento" "text",
    "valor_pago" numeric(10,2),
    "inter_txid" "text",
    "qr_code_payload" "text",
    "location_url" "text",
    "billing_type" "public"."billing_type_enum" DEFAULT 'subscription'::"public"."billing_type_enum" NOT NULL,
    "descricao" "text",
    "taxa_intermediacao_banco" numeric(10,2) DEFAULT 0.00,
    "dados_auditoria_pagamento" "jsonb" DEFAULT '{}'::"jsonb",
    "recibo_url" "text",

    CONSTRAINT "assinaturas_cobrancas_status_check" CHECK (("status" = ANY (ARRAY['pago'::"text", 'pendente_pagamento'::"text", 'cancelada'::"text"])))
);


ALTER TABLE "public"."assinaturas_cobrancas" OWNER TO "postgres";


COMMENT ON COLUMN "public"."assinaturas_cobrancas"."taxa_intermediacao_banco" IS 'Valor da taxa cobrada pelo banco (ex: Inter) na transação PIX';



CREATE TABLE IF NOT EXISTS "public"."assinaturas_usuarios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid",
    "plano_id" "uuid",
    "ativo" boolean DEFAULT true,
    "status" "text" DEFAULT 'pendente_pagamento'::"text" NOT NULL,
    "anchor_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "trial_end_at" timestamp with time zone,
    "preco_aplicado" numeric(10,2),
    "preco_origem" "text" DEFAULT 'normal'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "data_ativacao" timestamp with time zone,
    "franquia_contratada_cobrancas" integer,
    "vigencia_fim" timestamp without time zone,
    "cancelamento_manual" timestamp with time zone,
    "status_anterior" "text",
    CONSTRAINT "assinaturas_usuarios_preco_origem_check" CHECK (("preco_origem" = ANY (ARRAY['normal'::"text", 'promocional'::"text", 'personalizado'::"text"]))),
    CONSTRAINT "assinaturas_usuarios_status_check" CHECK (("status" = ANY (ARRAY['ativa'::"text", 'pendente_pagamento'::"text", 'cancelada'::"text", 'suspensa'::"text", 'trial'::"text"])))
);


ALTER TABLE "public"."assinaturas_usuarios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cobranca_notificacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cobranca_id" "uuid" NOT NULL,
    "tipo_origem" character varying(10) NOT NULL,
    "tipo_evento" character varying(50) NOT NULL,
    "canal" character varying(20) NOT NULL,
    "data_envio" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "chk_canal" CHECK ((("canal")::"text" = ANY ((ARRAY['whatsapp'::character varying, 'email'::character varying, 'sms'::character varying])::"text"[]))),
    CONSTRAINT "chk_tipo_origem" CHECK ((("tipo_origem")::"text" = ANY ((ARRAY['automatica'::character varying, 'manual'::character varying])::"text"[])))
);


ALTER TABLE "public"."cobranca_notificacoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cobrancas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "passageiro_id" "uuid" NOT NULL,
    "mes" integer NOT NULL,
    "ano" integer NOT NULL,
    "valor" numeric(10,2) NOT NULL,
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "data_vencimento" "date" NOT NULL,
    "data_pagamento" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "pagamento_manual" boolean DEFAULT false,
    "desativar_lembretes" boolean DEFAULT false NOT NULL,
    "usuario_id" "uuid",
    "origem" "text" DEFAULT '''automatica''::text'::"text" NOT NULL,
    "tipo_pagamento" "public"."tipo_pagamento_enum",
    "txid_pix" "text",
    "qr_code_payload" "text",
    "url_qr_code" "text",
    "valor_pago" numeric(10,2),
    "taxa_intermediacao_banco" numeric(10,2),
    "valor_a_repassar" numeric(10,2),
    "status_repasse" character varying(50) DEFAULT 'PENDENTE'::character varying,
    "data_repasse" timestamp without time zone,
    "id_transacao_repasse" "uuid",
    "dados_auditoria_pagamento" "jsonb" DEFAULT '{}'::"jsonb",
    "data_envio_ultima_notificacao" timestamp without time zone,
    "recibo_url" "text",
    CONSTRAINT "cobrancas_mes_check" CHECK ((("mes" >= 1) AND ("mes" <= 12))),
    CONSTRAINT "cobrancas_origem_check" CHECK (("origem" = ANY (ARRAY['automatica'::"text", 'manual'::"text"]))),
    CONSTRAINT "cobrancas_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'pago'::"text", 'atrasado'::"text"])))
);


ALTER TABLE "public"."cobrancas" OWNER TO "postgres";


COMMENT ON COLUMN "public"."cobrancas"."dados_auditoria_pagamento" IS 'Payload completo do webhook de pagamento para auditoria';



COMMENT ON COLUMN "public"."cobrancas"."data_envio_ultima_notificacao" IS 'Data e hora do último envio de notificação (Email/Zap) para esta cobrança';



CREATE TABLE IF NOT EXISTS "public"."configuracao_interna" (
    "id" bigint NOT NULL,
    "chave" "text" NOT NULL,
    "valor" "text" NOT NULL
);


ALTER TABLE "public"."configuracao_interna" OWNER TO "postgres";


ALTER TABLE "public"."configuracao_interna" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."configuracao_interna_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."escolas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "logradouro" "text",
    "numero" "text",
    "bairro" "text",
    "cidade" "text",
    "estado" "text",
    "cep" "text",
    "referencia" "text",
    "ativo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "usuario_id" "uuid" NOT NULL
);


ALTER TABLE "public"."escolas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gastos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "usuario_id" "uuid",
    "valor" numeric(10,2) NOT NULL,
    "data" "date" NOT NULL,
    "categoria" "text" NOT NULL,
    "descricao" "text",
    "veiculo_id" "uuid" DEFAULT "gen_random_uuid"()
);


ALTER TABLE "public"."gastos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."passageiros" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "nome_responsavel" "text" NOT NULL,
    "telefone_responsavel" "text" NOT NULL,
    "valor_cobranca" numeric(10,2) NOT NULL,
    "dia_vencimento" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "logradouro" "text",
    "numero" "text",
    "bairro" "text",
    "cidade" "text",
    "estado" "text",
    "cep" "text",
    "referencia" "text",
    "escola_id" "uuid" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "cpf_responsavel" "text" NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "email_responsavel" "text" NOT NULL,
    "genero" "text",
    "observacoes" "text",
    "veiculo_id" "uuid" NOT NULL,
    "periodo" "text" NOT NULL,
    "enviar_cobranca_automatica" boolean DEFAULT false,
    "origem_desativacao_cobranca_automatica" character varying(50) DEFAULT NULL::character varying,
    CONSTRAINT "alunos_dia_vencimento_check" CHECK ((("dia_vencimento" >= 1) AND ("dia_vencimento" <= 31)))
);


ALTER TABLE "public"."passageiros" OWNER TO "postgres";


COMMENT ON COLUMN "public"."passageiros"."origem_desativacao_cobranca_automatica" IS 'Razão da desativação da cobrança: manual (usuário), automatico (sistema por franquia), ou CONTA_EXCLUIDA.';



CREATE TABLE IF NOT EXISTS "public"."pix_validacao_pendente" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "x_id_idempotente" "text" NOT NULL,
    "chave_pix_enviada" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "status" character varying(50) DEFAULT 'PENDENTE'::character varying,
    "end_to_end_id" "text",
    "motivo_falha" "text",
    "tipo_chave" "text"
);


ALTER TABLE "public"."pix_validacao_pendente" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."planos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_id" "uuid",
    "tipo" "text" DEFAULT 'base'::"text" NOT NULL,
    "nome" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "descricao_curta" "text",
    "ordem_exibicao" integer DEFAULT 0,
    "ativo" boolean DEFAULT true,
    "limite_passageiros" integer DEFAULT 0,
    "franquia_cobrancas_mes" integer DEFAULT 0,
    "preco" numeric(10,2) NOT NULL,
    "preco_promocional" numeric(10,2),
    "promocao_ativa" boolean DEFAULT false,
    "permite_cobrancas" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "trial_days" integer DEFAULT 0,
    "beneficios" "jsonb" DEFAULT '[]'::"jsonb",
    CONSTRAINT "planos_tipo_check" CHECK (("tipo" = ANY (ARRAY['base'::"text", 'sub'::"text"])))
);


ALTER TABLE "public"."planos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pre_passageiros" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "nome_responsavel" "text" NOT NULL,
    "email_responsavel" "text" NOT NULL,
    "cpf_responsavel" "text" NOT NULL,
    "telefone_responsavel" "text" NOT NULL,
    "genero" "text",
    "logradouro" "text",
    "numero" "text",
    "bairro" "text",
    "cidade" "text",
    "estado" "text",
    "cep" "text",
    "referencia" "text",
    "observacoes" "text",
    "escola_id" "uuid",
    "valor_cobranca" numeric,
    "dia_vencimento" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "periodo" "text"
);


ALTER TABLE "public"."pre_passageiros" OWNER TO "postgres";


COMMENT ON COLUMN "public"."pre_passageiros"."valor_cobranca" IS 'Valor da cobrança mensal do passageiro (em reais)';



COMMENT ON COLUMN "public"."pre_passageiros"."dia_vencimento" IS 'Dia do mês para vencimento da cobrança (1-31)';



CREATE TABLE IF NOT EXISTS "public"."transacoes_repasse" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid",
    "cobranca_id" "uuid",
    "valor_repassado" numeric(10,2) NOT NULL,
    "txid_pix_repasse" "text",
    "status" character varying(50) DEFAULT 'PROCESSANDO'::character varying NOT NULL,
    "data_criacao" timestamp without time zone DEFAULT "now"(),
    "data_conclusao" timestamp without time zone,
    "mensagem_erro" "text"
);


ALTER TABLE "public"."transacoes_repasse" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usuarios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cpfcnpj" "text" NOT NULL,
    "email" "text" NOT NULL,
    "auth_uid" "uuid",
    "created_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    "telefone" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "updated_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    "apelido" "text" NOT NULL,
    "ativo" boolean DEFAULT true,
    "chave_pix" "text",
    "tipo_chave_pix" "text",
    "status_chave_pix" character varying(50) DEFAULT 'NAO_CADASTRADA'::character varying NOT NULL,
    "chave_pix_validada_em" timestamp with time zone,
    "nome_titular_pix_validado" "text",
    "cpf_cnpj_titular_pix_validado" "text",
    "whatsapp_status" "public"."whatsapp_status_enum" DEFAULT 'DISCONNECTED'::"public"."whatsapp_status_enum",
    "tipo" "public"."user_type_enum" DEFAULT 'motorista'::"public"."user_type_enum" NOT NULL,
    "pairing_code" character varying(64),
    "pairing_code_generated_at" timestamp with time zone DEFAULT now(),
    "pairing_code_expires_at" timestamp with time zone,
    "pairing_code_attempts" integer DEFAULT 0,
    "last_disconnection_notification_at" timestamp with time zone,
    "disconnection_notification_count" integer DEFAULT 0,
    "whatsapp_last_status_change_at" timestamp with time zone DEFAULT now()
);


ALTER TABLE "public"."usuarios" OWNER TO "postgres";


COMMENT ON COLUMN "public"."usuarios"."whatsapp_status" IS 'Status of the user''s WhatsApp instance (CONNECTED, DISCONNECTED, CONNECTING)';

COMMENT ON COLUMN "public"."usuarios"."last_disconnection_notification_at" IS 'Timestamp of the last disconnection notification sent to prevent spam';

COMMENT ON COLUMN "public"."usuarios"."disconnection_notification_count" IS 'Counter to track how many disconnection notifications have been sent (resets daily)';

COMMENT ON COLUMN "public"."usuarios"."whatsapp_last_status_change_at" IS 'Timestamp of the last status change to help identify persistent disconnections';



CREATE TABLE IF NOT EXISTS "public"."veiculos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "placa" "text" NOT NULL,
    "marca" "text" NOT NULL,
    "modelo" "text" NOT NULL,
    "ativo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."veiculos" OWNER TO "postgres";


ALTER TABLE ONLY "public"."passageiros"
    ADD CONSTRAINT "alunos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_updates"
    ADD CONSTRAINT "app_updates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assinatura_notificacoes"
    ADD CONSTRAINT "assinatura_notificacoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assinaturas_cobrancas"
    ADD CONSTRAINT "assinaturas_cobrancas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assinaturas_usuarios"
    ADD CONSTRAINT "assinaturas_usuarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cobranca_notificacoes"
    ADD CONSTRAINT "cobranca_notificacoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cobrancas"
    ADD CONSTRAINT "cobrancas_passageiro_id_mes_ano_key" UNIQUE ("passageiro_id", "mes", "ano");



ALTER TABLE ONLY "public"."cobrancas"
    ADD CONSTRAINT "cobrancas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."configuracao_interna"
    ADD CONSTRAINT "configuracao_interna_chave_key" UNIQUE ("chave");



ALTER TABLE ONLY "public"."configuracao_interna"
    ADD CONSTRAINT "configuracao_interna_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."escolas"
    ADD CONSTRAINT "escolas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."escolas"
    ADD CONSTRAINT "escolas_usuario_id_nome_unique" UNIQUE ("usuario_id", "nome");



ALTER TABLE ONLY "public"."gastos"
    ADD CONSTRAINT "gastos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pix_validacao_pendente"
    ADD CONSTRAINT "pix_validacao_pendente_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pix_validacao_pendente"
    ADD CONSTRAINT "pix_validacao_pendente_x_id_idempotente_key" UNIQUE ("x_id_idempotente");



ALTER TABLE ONLY "public"."planos"
    ADD CONSTRAINT "planos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."planos"
    ADD CONSTRAINT "planos_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."pre_passageiros"
    ADD CONSTRAINT "pre_passageiros_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transacoes_repasse"
    ADD CONSTRAINT "transacoes_repasse_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_auth_uid_key" UNIQUE ("auth_uid");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_cpfcnpj_key" UNIQUE ("cpfcnpj");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_telefone_key" UNIQUE ("telefone");



ALTER TABLE ONLY "public"."veiculos"
    ADD CONSTRAINT "veiculos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."veiculos"
    ADD CONSTRAINT "veiculos_usuario_id_placa_key" UNIQUE ("usuario_id", "placa");



CREATE INDEX "assinaturas_usuarios_ativo_idx" ON "public"."assinaturas_usuarios" USING "btree" ("ativo");



CREATE INDEX "assinaturas_usuarios_plano_id_idx" ON "public"."assinaturas_usuarios" USING "btree" ("plano_id");



CREATE INDEX "assinaturas_usuarios_usuario_id_idx" ON "public"."assinaturas_usuarios" USING "btree" ("usuario_id");



CREATE UNIQUE INDEX "assinaturas_usuarios_usuario_id_idx1" ON "public"."assinaturas_usuarios" USING "btree" ("usuario_id") WHERE ("ativo" = true);



CREATE INDEX "idx_ass_notificacoes_cobranca" ON "public"."assinatura_notificacoes" USING "btree" ("assinatura_cobranca_id", "tipo_evento");



CREATE INDEX "idx_cobrancas_data_envio_ultima_notificacao" ON "public"."cobrancas" USING "btree" ("data_envio_ultima_notificacao");



CREATE INDEX "idx_cobrancas_status_repasse" ON "public"."cobrancas" USING "btree" ("status_repasse");



CREATE INDEX "idx_passageiros_origem_desativacao_cobranca_automatica" ON "public"."passageiros" USING "btree" ("origem_desativacao_cobranca_automatica") WHERE ("origem_desativacao_cobranca_automatica" IS NOT NULL);



CREATE INDEX "idx_pix_validacao_pendente_usuario_id" ON "public"."pix_validacao_pendente" USING "btree" ("usuario_id");



CREATE INDEX "idx_pix_validacao_pendente_x_id_idempotente" ON "public"."pix_validacao_pendente" USING "btree" ("x_id_idempotente");



CREATE INDEX "idx_transacoes_repasse_cobranca_id" ON "public"."transacoes_repasse" USING "btree" ("cobranca_id");



CREATE INDEX "idx_transacoes_repasse_usuario_id" ON "public"."transacoes_repasse" USING "btree" ("usuario_id");



CREATE INDEX "idx_usuarios_status_chave_pix" ON "public"."usuarios" USING "btree" ("status_chave_pix");



CREATE INDEX "idx_usuarios_whatsapp_status" ON "public"."usuarios" USING "btree" ("whatsapp_status");

CREATE INDEX "idx_usuarios_pairing_code_expires_at" ON "public"."usuarios" USING "btree" ("pairing_code_expires_at");

CREATE INDEX "idx_usuarios_last_disconnection_notification" ON "public"."usuarios" USING "btree" ("id", "last_disconnection_notification_at");

CREATE INDEX "idx_usuarios_whatsapp_status_change" ON "public"."usuarios" USING "btree" ("whatsapp_status", "whatsapp_last_status_change_at");



CREATE INDEX "passageiros_veiculo_id_idx" ON "public"."passageiros" USING "btree" ("veiculo_id");
CREATE INDEX "idx_cobrancas_status" ON "public"."cobrancas" USING "btree" ("status");
CREATE INDEX "idx_cobrancas_data_vencimento" ON "public"."cobrancas" USING "btree" ("data_vencimento");
CREATE INDEX "idx_cobrancas_usuario_id" ON "public"."cobrancas" USING "btree" ("usuario_id");
CREATE INDEX "idx_cobrancas_passageiro_id" ON "public"."cobrancas" USING "btree" ("passageiro_id");

CREATE INDEX "idx_assinaturas_cobrancas_status" ON "public"."assinaturas_cobrancas" USING "btree" ("status");
CREATE INDEX "idx_assinaturas_cobrancas_usuario_id" ON "public"."assinaturas_cobrancas" USING "btree" ("usuario_id");
CREATE INDEX "idx_assinaturas_cobrancas_data_vencimento" ON "public"."assinaturas_cobrancas" USING "btree" ("data_vencimento");



CREATE OR REPLACE TRIGGER "update_alunos_updated_at" BEFORE UPDATE ON "public"."passageiros" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_cobrancas_updated_at" BEFORE UPDATE ON "public"."cobrancas" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_escolas_updated_at" BEFORE UPDATE ON "public"."escolas" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."assinatura_notificacoes"
    ADD CONSTRAINT "assinatura_notificacoes_assinatura_cobranca_id_fkey" FOREIGN KEY ("assinatura_cobranca_id") REFERENCES "public"."assinaturas_cobrancas"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assinatura_notificacoes"
    ADD CONSTRAINT "assinatura_notificacoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assinaturas_cobrancas"
    ADD CONSTRAINT "assinaturas_cobrancas_assinatura_usuario_id_fkey" FOREIGN KEY ("assinatura_usuario_id") REFERENCES "public"."assinaturas_usuarios"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assinaturas_cobrancas"
    ADD CONSTRAINT "assinaturas_cobrancas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assinaturas_usuarios"
    ADD CONSTRAINT "assinaturas_usuarios_plano_id_fkey" FOREIGN KEY ("plano_id") REFERENCES "public"."planos"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."assinaturas_usuarios"
    ADD CONSTRAINT "assinaturas_usuarios_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cobranca_notificacoes"
    ADD CONSTRAINT "cobranca_notificacoes_cobranca_id_fkey" FOREIGN KEY ("cobranca_id") REFERENCES "public"."cobrancas"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cobrancas"
    ADD CONSTRAINT "cobrancas_id_transacao_repasse_fkey" FOREIGN KEY ("id_transacao_repasse") REFERENCES "public"."transacoes_repasse"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."cobrancas"
    ADD CONSTRAINT "cobrancas_passageiro_id_fkey" FOREIGN KEY ("passageiro_id") REFERENCES "public"."passageiros"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cobrancas"
    ADD CONSTRAINT "cobrancas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."escolas"
    ADD CONSTRAINT "escolas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gastos"
    ADD CONSTRAINT "gastos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gastos"
    ADD CONSTRAINT "gastos_veiculo_id_fkey" FOREIGN KEY ("veiculo_id") REFERENCES "public"."veiculos"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."passageiros"
    ADD CONSTRAINT "passageiros_escola_id_fkey" FOREIGN KEY ("escola_id") REFERENCES "public"."escolas"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."passageiros"
    ADD CONSTRAINT "passageiros_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."passageiros"
    ADD CONSTRAINT "passageiros_veiculo_id_fkey" FOREIGN KEY ("veiculo_id") REFERENCES "public"."veiculos"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pix_validacao_pendente"
    ADD CONSTRAINT "pix_validacao_pendente_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."planos"
    ADD CONSTRAINT "planos_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."planos"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pre_passageiros"
    ADD CONSTRAINT "pre_passageiros_escola_id_fkey" FOREIGN KEY ("escola_id") REFERENCES "public"."escolas"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pre_passageiros"
    ADD CONSTRAINT "pre_passageiros_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transacoes_repasse"
    ADD CONSTRAINT "transacoes_repasse_cobranca_id_fkey" FOREIGN KEY ("cobranca_id") REFERENCES "public"."cobrancas"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transacoes_repasse"
    ADD CONSTRAINT "transacoes_repasse_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_auth_uid_fkey" FOREIGN KEY ("auth_uid") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."veiculos"
    ADD CONSTRAINT "veiculos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON UPDATE CASCADE ON DELETE CASCADE;





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."assinaturas_cobrancas";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."usuarios";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."bytea_to_text"("data" "bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."bytea_to_text"("data" "bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."bytea_to_text"("data" "bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bytea_to_text"("data" "bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."http"("request" "public"."http_request") TO "postgres";
GRANT ALL ON FUNCTION "public"."http"("request" "public"."http_request") TO "anon";
GRANT ALL ON FUNCTION "public"."http"("request" "public"."http_request") TO "authenticated";
GRANT ALL ON FUNCTION "public"."http"("request" "public"."http_request") TO "service_role";



GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying, "content" character varying, "content_type" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying, "content" character varying, "content_type" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying, "content" character varying, "content_type" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying, "content" character varying, "content_type" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying, "data" "jsonb") TO "postgres";
GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying, "data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying, "data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying, "data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."http_head"("uri" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_head"("uri" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_head"("uri" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_head"("uri" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_header"("field" character varying, "value" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_header"("field" character varying, "value" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_header"("field" character varying, "value" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_header"("field" character varying, "value" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_list_curlopt"() TO "postgres";
GRANT ALL ON FUNCTION "public"."http_list_curlopt"() TO "anon";
GRANT ALL ON FUNCTION "public"."http_list_curlopt"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_list_curlopt"() TO "service_role";



GRANT ALL ON FUNCTION "public"."http_patch"("uri" character varying, "content" character varying, "content_type" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_patch"("uri" character varying, "content" character varying, "content_type" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_patch"("uri" character varying, "content" character varying, "content_type" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_patch"("uri" character varying, "content" character varying, "content_type" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "data" "jsonb") TO "postgres";
GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "content" character varying, "content_type" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "content" character varying, "content_type" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "content" character varying, "content_type" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "content" character varying, "content_type" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_put"("uri" character varying, "content" character varying, "content_type" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_put"("uri" character varying, "content" character varying, "content_type" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_put"("uri" character varying, "content" character varying, "content_type" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_put"("uri" character varying, "content" character varying, "content_type" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_reset_curlopt"() TO "postgres";
GRANT ALL ON FUNCTION "public"."http_reset_curlopt"() TO "anon";
GRANT ALL ON FUNCTION "public"."http_reset_curlopt"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_reset_curlopt"() TO "service_role";



GRANT ALL ON FUNCTION "public"."http_set_curlopt"("curlopt" character varying, "value" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_set_curlopt"("curlopt" character varying, "value" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_set_curlopt"("curlopt" character varying, "value" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_set_curlopt"("curlopt" character varying, "value" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."text_to_bytea"("data" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."text_to_bytea"("data" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."text_to_bytea"("data" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."text_to_bytea"("data" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."urlencode"("string" "bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."urlencode"("string" "bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."urlencode"("string" "bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."urlencode"("string" "bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."urlencode"("data" "jsonb") TO "postgres";
GRANT ALL ON FUNCTION "public"."urlencode"("data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."urlencode"("data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."urlencode"("data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."urlencode"("string" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."urlencode"("string" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."urlencode"("string" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."urlencode"("string" character varying) TO "service_role";


















GRANT ALL ON TABLE "public"."app_updates" TO "anon";
GRANT ALL ON TABLE "public"."app_updates" TO "authenticated";
GRANT ALL ON TABLE "public"."app_updates" TO "service_role";



GRANT ALL ON TABLE "public"."assinatura_notificacoes" TO "anon";
GRANT ALL ON TABLE "public"."assinatura_notificacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."assinatura_notificacoes" TO "service_role";



GRANT ALL ON TABLE "public"."assinaturas_cobrancas" TO "anon";
GRANT ALL ON TABLE "public"."assinaturas_cobrancas" TO "authenticated";
GRANT ALL ON TABLE "public"."assinaturas_cobrancas" TO "service_role";



GRANT ALL ON TABLE "public"."assinaturas_usuarios" TO "anon";
GRANT ALL ON TABLE "public"."assinaturas_usuarios" TO "authenticated";
GRANT ALL ON TABLE "public"."assinaturas_usuarios" TO "service_role";



GRANT ALL ON TABLE "public"."cobranca_notificacoes" TO "anon";
GRANT ALL ON TABLE "public"."cobranca_notificacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."cobranca_notificacoes" TO "service_role";



GRANT ALL ON TABLE "public"."cobrancas" TO "anon";
GRANT ALL ON TABLE "public"."cobrancas" TO "authenticated";
GRANT ALL ON TABLE "public"."cobrancas" TO "service_role";



GRANT ALL ON TABLE "public"."configuracao_interna" TO "anon";
GRANT ALL ON TABLE "public"."configuracao_interna" TO "authenticated";
GRANT ALL ON TABLE "public"."configuracao_interna" TO "service_role";



GRANT ALL ON SEQUENCE "public"."configuracao_interna_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."configuracao_interna_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."configuracao_interna_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."escolas" TO "anon";
GRANT ALL ON TABLE "public"."escolas" TO "authenticated";
GRANT ALL ON TABLE "public"."escolas" TO "service_role";



GRANT ALL ON TABLE "public"."gastos" TO "anon";
GRANT ALL ON TABLE "public"."gastos" TO "authenticated";
GRANT ALL ON TABLE "public"."gastos" TO "service_role";



GRANT ALL ON TABLE "public"."passageiros" TO "anon";
GRANT ALL ON TABLE "public"."passageiros" TO "authenticated";
GRANT ALL ON TABLE "public"."passageiros" TO "service_role";



GRANT ALL ON TABLE "public"."pix_validacao_pendente" TO "anon";
GRANT ALL ON TABLE "public"."pix_validacao_pendente" TO "authenticated";
GRANT ALL ON TABLE "public"."pix_validacao_pendente" TO "service_role";



GRANT ALL ON TABLE "public"."planos" TO "anon";
GRANT ALL ON TABLE "public"."planos" TO "authenticated";
GRANT ALL ON TABLE "public"."planos" TO "service_role";



GRANT ALL ON TABLE "public"."pre_passageiros" TO "anon";
GRANT ALL ON TABLE "public"."pre_passageiros" TO "authenticated";
GRANT ALL ON TABLE "public"."pre_passageiros" TO "service_role";



GRANT ALL ON TABLE "public"."transacoes_repasse" TO "anon";
GRANT ALL ON TABLE "public"."transacoes_repasse" TO "authenticated";
GRANT ALL ON TABLE "public"."transacoes_repasse" TO "service_role";



GRANT ALL ON TABLE "public"."usuarios" TO "anon";
GRANT ALL ON TABLE "public"."usuarios" TO "authenticated";
GRANT ALL ON TABLE "public"."usuarios" TO "service_role";



GRANT ALL ON TABLE "public"."veiculos" TO "anon";
GRANT ALL ON TABLE "public"."veiculos" TO "authenticated";
GRANT ALL ON TABLE "public"."veiculos" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































-- Performance Indexes (Unified)
CREATE INDEX IF NOT EXISTS "idx_passageiros_escola_id" ON "public"."passageiros"("escola_id");
CREATE INDEX IF NOT EXISTS "idx_passageiros_usuario_id" ON "public"."passageiros"("usuario_id");
CREATE INDEX IF NOT EXISTS "idx_cobrancas_passageiro_id" ON "public"."cobrancas"("passageiro_id");
CREATE INDEX IF NOT EXISTS "idx_cobrancas_usuario_id" ON "public"."cobrancas"("usuario_id");
CREATE INDEX IF NOT EXISTS "idx_gastos_veiculo_id" ON "public"."gastos"("veiculo_id");


-- FUNCTION: Anonymize User Account (LGPD Compliance)
-- Replaces PII with generic data instead of deleting, preserving financial history.
CREATE OR REPLACE FUNCTION "public"."anonymize_user_account"("target_user_id" uuid) RETURNS void
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    AS $$
BEGIN
  -- 1. DELETE non-critical data (Physical Deletion)
  DELETE FROM "public"."pre_passageiros" WHERE "usuario_id" = target_user_id;
  DELETE FROM "public"."pix_validacao_pendente" WHERE "usuario_id" = target_user_id;
  DELETE FROM "public"."cobranca_notificacoes" WHERE "cobranca_id" IN (
    SELECT id FROM "public"."cobrancas" WHERE "usuario_id" = target_user_id
  );
  DELETE FROM "public"."assinatura_notificacoes" WHERE "usuario_id" = target_user_id;

  -- 2. ANONYMIZE Core User Data
  UPDATE "public"."usuarios"
  SET
    "nome" = 'Usuário Excluído',
    "apelido" = 'Anônimo',
    "email" = 'deleted_' || "id"::text || '@van360.anon',
    "cpfcnpj" = 'DEL' || substring("id"::text, 1, 11),
    "telefone" = '00000000000_' || substring("id"::text, 1, 5),
    "chave_pix" = NULL,
    "tipo_chave_pix" = NULL,
    "status_chave_pix" = 'NAO_CADASTRADA',
    "nome_titular_pix_validado" = NULL,
    "cpf_cnpj_titular_pix_validado" = NULL,
    "auth_uid" = NULL,
    "ativo" = false,
    "whatsapp_status" = 'DISCONNECTED'
  WHERE "id" = target_user_id;

  -- 3. ANONYMIZE Passengers (Keep ID for Cobrancas)
  UPDATE "public"."passageiros"
  SET
    "nome" = 'Passageiro ' || substring("id"::text, 1, 8),
    "nome_responsavel" = 'Responsável Anônimo',
    "cpf_responsavel" = '00000000000',
    "email_responsavel" = 'anon@anon.com',
    "telefone_responsavel" = '00000000000',
    "logradouro" = NULL,
    "numero" = NULL,
    "bairro" = NULL,
    "cidade" = NULL,
    "estado" = NULL,
    "cep" = NULL,
    "referencia" = NULL,
    "observacoes" = NULL,
    "ativo" = false
  WHERE "usuario_id" = target_user_id;

  -- 4. ANONYMIZE Vehicles
  UPDATE "public"."veiculos"
  SET
    "placa" = 'DEL-' || substring("id"::text, 1, 4),
    "marca" = 'Genérica',
    "modelo" = 'Genérico'
  WHERE "usuario_id" = target_user_id;

  -- 5. ANONYMIZE Schools
  UPDATE "public"."escolas"
  SET
    "nome" = 'Escola ' || substring("id"::text, 1, 8),
    "logradouro" = NULL,
    "numero" = NULL,
    "bairro" = NULL,
    "cidade" = NULL,
    "estado" = NULL,
    "cep" = NULL,
    "referencia" = NULL
  WHERE "usuario_id" = target_user_id;

  -- 6. SANITIZE Financial Records (Remove PII from audit logs)
  UPDATE "public"."cobrancas"
  SET
    "dados_auditoria_pagamento" = '{}'::jsonb,
    "recibo_url" = NULL,
    "url_qr_code" = NULL,
    "qr_code_payload" = NULL
  WHERE "usuario_id" = target_user_id;

  -- 7. ANONYMIZE/CANCEL SaaS Subscriptions (Stop future billing)
  UPDATE "public"."assinaturas_usuarios"
  SET
    "ativo" = false,
    "status" = 'cancelada',
    "billing_mode" = 'manual' -- Prevent auto-renewal
  WHERE "usuario_id" = target_user_id;

  -- 8. SANITIZE SaaS Billing Records (Keep history, remove PII artifacts)
  UPDATE "public"."assinaturas_cobrancas"
  SET
    "qr_code_payload" = NULL,
    "location_url" = NULL,
    "recibo_url" = NULL,
    "dados_auditoria_pagamento" = '{}'::jsonb
  WHERE "usuario_id" = target_user_id;

  UPDATE "public"."gastos"
  SET "descricao" = 'Gasto histórico (Conta excluída)'
  WHERE "usuario_id" = target_user_id;

END;
$$;

