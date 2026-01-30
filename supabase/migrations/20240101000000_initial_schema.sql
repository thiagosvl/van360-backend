

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

CREATE TYPE "public"."modalidade_enum" AS ENUM (
    'ida',
    'volta',
    'ida_volta'
);

ALTER TYPE "public"."modalidade_enum" OWNER TO "postgres";

CREATE TYPE "public"."parentesco_enum" AS ENUM (
    'pai',
    'mae',
    'avo',
    'tio',
    'irmao',
    'primo',
    'padrastro',
    'madrasta',
    'responsavel_legal',
    'outro'
);

ALTER TYPE "public"."parentesco_enum" OWNER TO "postgres";

CREATE TYPE "public"."genero_enum" AS ENUM (
    'masculino',
    'feminino',
    'prefiro_nao_informar'
);

ALTER TYPE "public"."genero_enum" OWNER TO "postgres";


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
    "gateway_txid" "text",
    "qr_code_payload" "text",
    "location_url" "text",
    "billing_type" "public"."billing_type_enum" DEFAULT 'subscription'::"public"."billing_type_enum" NOT NULL,
    "descricao" "text",
    "gateway_fee" numeric(10,2) DEFAULT 0.00,
    "dados_auditoria_pagamento" "jsonb" DEFAULT '{}'::"jsonb",
    "recibo_url" "text",

    CONSTRAINT "assinaturas_cobrancas_status_check" CHECK (("status" = ANY (ARRAY['pago'::"text", 'pendente_pagamento'::"text", 'cancelada'::"text"])))
);


ALTER TABLE "public"."assinaturas_cobrancas" OWNER TO "postgres";


COMMENT ON COLUMN "public"."assinaturas_cobrancas"."gateway_fee" IS 'Valor da taxa cobrada pelo provedor de pagamento na transação PIX';



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
    "gateway_txid" "text",
    "qr_code_payload" "text",
    "location_url" "text",
    "valor_pago" numeric(10,2),
    "gateway_fee" numeric(10,2),
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
    "genero" "public"."genero_enum",
    "observacoes" "text",
    "veiculo_id" "uuid" NOT NULL,
    "periodo" "text" NOT NULL,
    "modalidade" "public"."modalidade_enum",
    "data_nascimento" "date",
    "parentesco_responsavel" "public"."parentesco_enum",
    "data_inicio_transporte" "date",
    "enviar_cobranca_automatica" boolean DEFAULT false,
    "origem_desativacao_cobranca_automatica" character varying(50) DEFAULT NULL::character varying,
    CONSTRAINT "passageiros_dia_vencimento_check" CHECK ((("dia_vencimento" >= 1) AND ("dia_vencimento" <= 31)))
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
    "genero" "public"."genero_enum",
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
    "periodo" "text",
    "modalidade" "public"."modalidade_enum",
    "data_nascimento" "date",
    "parentesco_responsavel" "public"."parentesco_enum",
    "data_inicio_transporte" "date"
);


ALTER TABLE "public"."pre_passageiros" OWNER TO "postgres";


COMMENT ON COLUMN "public"."pre_passageiros"."valor_cobranca" IS 'Valor da cobrança mensal do passageiro (em reais)';



COMMENT ON COLUMN "public"."pre_passageiros"."dia_vencimento" IS 'Dia do mês para vencimento da cobrança (1-31)';



CREATE TABLE IF NOT EXISTS "public"."transacoes_repasse" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid",
    "cobranca_id" "uuid",
    "valor_repassado" numeric(10,2) NOT NULL,
    "gateway_txid" "text",
    "status" character varying(50) DEFAULT 'PENDENTE'::character varying NOT NULL,
    "data_criacao" timestamp with time zone DEFAULT "now"(),
    "data_conclusao" timestamp with time zone,
    "mensagem_erro" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
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
    "tipo" "public"."user_type_enum" DEFAULT 'motorista'::"public"."user_type_enum" NOT NULL,
    "assinatura_url" "text",
    "config_contrato" "jsonb" DEFAULT '{
      "usar_contratos": true,
      "configurado": false,
      "multa_atraso": { "valor": 10.00, "tipo": "percentual" },
      "multa_rescisao": { "valor": 15.00, "tipo": "percentual" },
      "clausulas": [
        "O serviço contratado consiste no transporte do passageiro acima citado, no trajeto com origem e destino acordado entre as partes.",
        "Somente o passageiro CONTRATANTE está autorizado a utilizar-se do objeto deste contrato, sendo vedado o passageiro se fazer acompanhar de colegas, parentes, amigos e etc.",
        "O transporte ora contratado se refere exclusivamente ao horário regular da escola pré-determinado, não sendo de responsabilidade da CONTRATADA o transporte do passageiro em turno diferente do contratado, em horários de atividades extracurriculares ou que por determinação da escola seja alterado.",
        "O procedimento de retirada e entrega do passageiro na residência ou local combinado deverá ser acordado entre as partes, definindo um responsável para acompanhar o passageiro.",
        "A partir do momento que for realizada a entrega do passageiro na escola, a CONTRATADA não é mais responsável pela segurança do passageiro, bem como de seus pertences.",
        "As partes deverão respeitar os horários previamente combinados de saída dos locais de origem e destino, ficando estabelecido que, caso ocorra mudança no local de origem, destino ou retorno, a CONTRATADA reserva-se o direito de aceitar ou não tais alterações, em razão da modificação de rota, podendo, inclusive, ficar desobrigada da prestação dos serviços previstos neste contrato.",
        "Fica estabelecido que, caso a CONTRATANTE ou algum outro responsável pelo passageiro for buscá-lo no lugar da CONTRATADA, a CONTRATANTE deverá comunicar à CONTRATADA e à escola previamente.",
        "A CONTRATANTE obriga-se a informar a CONTRATADA com um prazo de até duas horas antes do horário se o passageiro não for comparecer à escola naquele dia.",
        "Está proibido o consumo de alimentos no interior do veículo escolar, com a finalidade de evitar e prevenir acidentes, como engasgos, ou constrangimento de outros passageiros, além de manter a limpeza do veículo.",
        "Para os efeitos deste contrato, o transporte pactuado ficará temporariamente suspenso no caso de o passageiro apresentar doença infectocontagiosa, visando preservar a saúde e a segurança das crianças transportadas e dos prestadores do serviço.",
        "O veículo passa por duas vistorias anuais (uma em cada semestre), onde nesse dia não haverá transporte e assim visando a segurança do mesmo. Avisaremos com antecedência a data das vistorias.",
        "A CONTRATANTE pagará à CONTRATADA o valor mensal acordado, conforme forma de pagamento e parcelamento previamente acordados entre as partes, sendo o pagamento devido integralmente e de forma regular inclusive durante os períodos de férias dos meses de julho, dezembro e janeiro, bem como em casos de recessos, greves, afastamento temporário do passageiro por motivo de doença, férias, viagens, pandemia ou qualquer outro motivo, inclusive de força maior.",
        "As parcelas deverão ser pagas até o dia estabelecido nas CONDIÇÕES DE VALOR, durante todo o período de vigência do contrato. Em caso de atraso no pagamento, a CONTRATANTE poderá estar sujeita à multa prevista nas CONDIÇÕES DE VALOR, sendo que, após a notificação do atraso, a CONTRATADA poderá conceder um prazo para regularização. Persistindo o não pagamento da parcela em atraso, a prestação do serviço poderá ser suspensa até que a situação seja regularizada.",
        "Início do ano terá reajuste da mensalidade e um novo contrato será emitido.",
        "Em caso de comportamento inadequado, desobediência às normas de segurança ou atitude antissocial, o passageiro poderá sofrer advertência por escrito e, em caso de reincidência, ocorrerá a rescisão do contrato motivada.",
        "O contrato pode ser rescindido imotivadamente por qualquer das partes, com aplicação de multa rescisória conforme percentual descrito nas condições de valor sobre as parcelas pendentes, exceto quando a rescisão for motivada.",
        "É convencionado que a CONTRATADA não será responsabilizada pela vigilância de objetos pessoais, material escolar, dinheiro, joias ou quaisquer pertences eventualmente esquecidos pelo passageiro no veículo ou no estabelecimento escolar.",
        "As partes reconhecem o presente contrato como título executivo extrajudicial nos termos do artigo 784, XI, do Código de Processo Civil, sem prejuízo da opção pelo processo de conhecimento para obtenção de título executivo judicial, nos termos do artigo 785.",
        "O serviço do transporte escolar será prestado até a data de término estabelecida nas CONDIÇÕES DO PERÍODO."
      ]
    }'::jsonb
);



ALTER TABLE "public"."usuarios" OWNER TO "postgres";





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
    ADD CONSTRAINT "passageiros_pkey" PRIMARY KEY ("id");



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






CREATE INDEX "passageiros_veiculo_id_idx" ON "public"."passageiros" USING "btree" ("veiculo_id");
CREATE INDEX "idx_cobrancas_status" ON "public"."cobrancas" USING "btree" ("status");
CREATE INDEX "idx_cobrancas_data_vencimento" ON "public"."cobrancas" USING "btree" ("data_vencimento");
CREATE INDEX "idx_cobrancas_usuario_id" ON "public"."cobrancas" USING "btree" ("usuario_id");
CREATE INDEX "idx_cobrancas_passageiro_id" ON "public"."cobrancas" USING "btree" ("passageiro_id");

CREATE INDEX "idx_assinaturas_cobrancas_status" ON "public"."assinaturas_cobrancas" USING "btree" ("status");
CREATE INDEX "idx_assinaturas_cobrancas_usuario_id" ON "public"."assinaturas_cobrancas" USING "btree" ("usuario_id");
CREATE INDEX "idx_assinaturas_cobrancas_data_vencimento" ON "public"."assinaturas_cobrancas" USING "btree" ("data_vencimento");



CREATE OR REPLACE TRIGGER "update_passageiros_updated_at" BEFORE UPDATE ON "public"."passageiros" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



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
    ADD CONSTRAINT "cobrancas_passageiro_id_fkey" FOREIGN KEY ("passageiro_id") REFERENCES "public"."passageiros"("id") ON UPDATE CASCADE ON DELETE CASCADE;



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
  DELETE FROM "public"."contratos" WHERE "usuario_id" = target_user_id;

  -- 2. ANONYMIZE Core User Data
  UPDATE "public"."usuarios"
  SET
    "nome" = 'Usuário Excluído',
    "apelido" = 'Anônimo',
    "email" = 'deleted_' || "id"::text || '@van360.anon',
    "cpfcnpj" = 'DEL' || substring("id"::text, 1, 11),
    "telefone" = '00000000000_' || substring("id"::text, 1, 5),
    "chave_pix_validada_em" = NULL,
    "assinatura_url" = NULL,
    "config_contrato" = '{
      "usar_contratos": false,
      "configurado": false,
      "multa_atraso": { "valor": 0, "tipo": "percentual" },
      "multa_rescisao": { "valor": 0, "tipo": "percentual" },
      "clausulas": []
    }'::jsonb,
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
    "location_url" = NULL,
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



-- =====================================================
-- CONTRATOS DIGITAIS
-- =====================================================

-- Tabela: contratos
CREATE TABLE IF NOT EXISTS "public"."contratos" (
    "id" UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "usuario_id" UUID NOT NULL REFERENCES "public"."usuarios"("id") ON DELETE CASCADE,
    "passageiro_id" UUID NOT NULL REFERENCES "public"."passageiros"("id") ON DELETE CASCADE,
    "token_acesso" VARCHAR(255) UNIQUE NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pendente',
    "provider" VARCHAR(50) NOT NULL DEFAULT 'inhouse',
    "minuta_url" TEXT,
    "contrato_final_url" TEXT,
    "dados_contrato" JSONB NOT NULL,
    "assinatura_metadados" JSONB,
    "provider_document_id" TEXT,
    "provider_link_assinatura" TEXT,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "assinado_em" TIMESTAMP WITH TIME ZONE,
    "expira_em" TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days'),
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "ano" INTEGER,
    "data_inicio" DATE,
    "data_fim" DATE,
    "valor_total" NUMERIC(10,2),
    "qtd_parcelas" INTEGER,
    "valor_parcela" NUMERIC(10,2),
    "dia_vencimento" INTEGER,
    "multa_atraso_valor" NUMERIC(10,2),
    "multa_atraso_tipo" VARCHAR(20),
    "multa_rescisao_valor" NUMERIC(10,2),
    "multa_rescisao_tipo" VARCHAR(20),
    
    CONSTRAINT "contratos_status_check" CHECK ("status" IN ('pendente', 'assinado', 'substituido'))
);


ALTER TABLE "public"."contratos" OWNER TO "postgres";

CREATE INDEX "idx_contratos_token" ON "public"."contratos"("token_acesso");
CREATE INDEX "idx_contratos_status" ON "public"."contratos"("status");
CREATE INDEX "idx_contratos_usuario" ON "public"."contratos"("usuario_id");
CREATE INDEX "idx_contratos_passageiro" ON "public"."contratos"("passageiro_id");
CREATE INDEX "idx_contratos_provider" ON "public"."contratos"("provider");

COMMENT ON TABLE "public"."contratos" IS 'Contratos de transporte escolar gerados e assinados digitalmente';
COMMENT ON COLUMN "public"."contratos"."provider" IS 'Provedor de assinatura: inhouse, assinafy, docusign, etc';
COMMENT ON COLUMN "public"."contratos"."dados_contrato" IS 'Dados do contrato (nome, valor, datas, endereço, etc)';
COMMENT ON COLUMN "public"."contratos"."assinatura_metadados" IS 'Metadados de auditoria (IP, user-agent, timestamp, hash)';
COMMENT ON COLUMN "public"."contratos"."provider_document_id" IS 'ID do documento no provedor externo (se aplicável)';

-- Trigger para atualizar updated_at
CREATE TRIGGER "update_contratos_updated_at"
BEFORE UPDATE ON "public"."contratos"
FOR EACH ROW
EXECUTE FUNCTION "public"."update_updated_at_column"();

-- Tabela: contratos_templates
CREATE TABLE IF NOT EXISTS "public"."contratos_templates" (
    "id" UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "nome" VARCHAR(255) NOT NULL,
    "descricao" TEXT,
    "arquivo_url" TEXT NOT NULL,
    "ativo" BOOLEAN DEFAULT TRUE NOT NULL,
    "campos_variaveis" JSONB DEFAULT '[]'::jsonb,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE "public"."contratos_templates" OWNER TO "postgres";

COMMENT ON TABLE "public"."contratos_templates" IS 'Templates de contratos (PDFs base)';
COMMENT ON COLUMN "public"."contratos_templates"."campos_variaveis" IS 'Lista de campos que podem ser preenchidos dinamicamente';

-- Trigger para atualizar updated_at
CREATE TRIGGER "update_contratos_templates_updated_at"
BEFORE UPDATE ON "public"."contratos_templates"
FOR EACH ROW
EXECUTE FUNCTION "public"."update_updated_at_column"();

-- Tabela: contratos_notificacoes
CREATE TABLE IF NOT EXISTS "public"."contratos_notificacoes" (
    "id" UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "contrato_id" UUID NOT NULL REFERENCES "public"."contratos"("id") ON DELETE CASCADE,
    "tipo_evento" VARCHAR(50) NOT NULL,
    "canal" VARCHAR(20) DEFAULT 'WHATSAPP' NOT NULL,
    "data_envio" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "sucesso" BOOLEAN DEFAULT TRUE NOT NULL,
    "mensagem_erro" TEXT,
    
    CONSTRAINT "chk_contratos_notificacoes_canal" CHECK ("canal" IN ('whatsapp', 'email', 'sms'))
);

ALTER TABLE "public"."contratos_notificacoes" OWNER TO "postgres";

CREATE INDEX "idx_contratos_notificacoes_contrato" ON "public"."contratos_notificacoes"("contrato_id");

COMMENT ON TABLE "public"."contratos_notificacoes" IS 'Registro de notificações enviadas relacionadas a contratos';
COMMENT ON COLUMN "public"."contratos_notificacoes"."tipo_evento" IS 'Tipo de evento: contrato_criado, link_enviado, assinado, cancelado';
