-- Habilita REPLICA IDENTITY FULL para capturar alterações completas no Realtime
ALTER TABLE "public"."cobrancas_repasses" REPLICA IDENTITY FULL;

-- Adiciona a tabela cobrancas_repasses na publicação supabase_realtime
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE cobrancas_repasses;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- Habilita Row Level Security na tabela cobrancas_repasses
ALTER TABLE "public"."cobrancas_repasses" ENABLE ROW LEVEL SECURITY;

-- Garante acesso de leitura para administradores no Realtime e queries diretas
DROP POLICY IF EXISTS "Enable read access for authenticated admins on cobrancas_repasses" ON "public"."cobrancas_repasses";
CREATE POLICY "Enable read access for authenticated admins on cobrancas_repasses"
  ON "public"."cobrancas_repasses"
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Garante acesso de leitura para motoristas aos seus próprios registros de repasse
DROP POLICY IF EXISTS "Enable read access for motoristas on own cobrancas_repasses" ON "public"."cobrancas_repasses";
CREATE POLICY "Enable read access for motoristas on own cobrancas_repasses"
  ON "public"."cobrancas_repasses"
  FOR SELECT
  TO authenticated
  USING (motorista_id = auth.uid());
