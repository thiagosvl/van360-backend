ALTER TABLE "public"."cobrancas"
    DROP CONSTRAINT IF EXISTS "cobrancas_status_check",
    ADD CONSTRAINT "cobrancas_status_check" CHECK (("status" = ANY (ARRAY['pendente'::text, 'pago'::text, 'cancelada'::text])));
