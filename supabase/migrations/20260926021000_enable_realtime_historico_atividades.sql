ALTER TABLE "public"."historico_atividades" REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE historico_atividades;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = auth.uid()
    AND tipo = 'admin'
  );
$$;

DROP POLICY IF EXISTS "Enable read access for authenticated admins on historico_atividades" ON "public"."historico_atividades";
CREATE POLICY "Enable read access for authenticated admins on historico_atividades"
  ON "public"."historico_atividades"
  FOR SELECT
  TO authenticated
  USING (public.is_admin());
