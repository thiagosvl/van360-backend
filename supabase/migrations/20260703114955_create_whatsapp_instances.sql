CREATE TYPE "public"."whatsapp_purpose_enum" AS ENUM (
    'TRANSACTIONAL',
    'BULK'
);

ALTER TYPE "public"."whatsapp_purpose_enum" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."whatsapp_instances" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "instance_name" "text" NOT NULL,
    "description" "text",
    "purpose" "public"."whatsapp_purpose_enum" DEFAULT 'TRANSACTIONAL'::"public"."whatsapp_purpose_enum" NOT NULL,
    "rate_limit_max" integer DEFAULT 10,
    "rate_limit_duration" integer DEFAULT 10000,
    "is_active" boolean DEFAULT true NOT NULL,
    "is_default_for_purpose" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."whatsapp_instances" OWNER TO "postgres";

ALTER TABLE ONLY "public"."whatsapp_instances"
    ADD CONSTRAINT "whatsapp_instances_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."whatsapp_instances"
    ADD CONSTRAINT "whatsapp_instances_name_key" UNIQUE ("instance_name");

CREATE OR REPLACE TRIGGER "update_whatsapp_instances_updated_at" BEFORE UPDATE ON "public"."whatsapp_instances" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

-- Insert initial seed
INSERT INTO "public"."whatsapp_instances" 
("instance_name", "description", "purpose", "rate_limit_max", "rate_limit_duration", "is_active", "is_default_for_purpose")
VALUES 
('Van360', 'Instância Principal', 'TRANSACTIONAL', 50, 10000, true, true);
