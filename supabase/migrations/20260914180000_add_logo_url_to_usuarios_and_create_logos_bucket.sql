-- =====================================================
-- MIGRATION: Adicionar logo_url aos usuarios e criar bucket logos
-- =====================================================

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS logo_url text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'logos',
    'logos',
    true,
    5242880,
    ARRAY['image/png', 'image/jpeg']::text[]
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg']::text[];

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'Permitir Leitura Publica Logos'
          AND tablename = 'objects'
          AND schemaname = 'storage'
    ) THEN
        CREATE POLICY "Permitir Leitura Publica Logos"
        ON storage.objects FOR SELECT
        TO public
        USING (bucket_id = 'logos');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'Permitir Upload Usuario Autenticado Logos'
          AND tablename = 'objects'
          AND schemaname = 'storage'
    ) THEN
        CREATE POLICY "Permitir Upload Usuario Autenticado Logos"
        ON storage.objects FOR INSERT
        TO authenticated
        WITH CHECK (bucket_id = 'logos');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'Permitir Update Usuario Autenticado Logos'
          AND tablename = 'objects'
          AND schemaname = 'storage'
    ) THEN
        CREATE POLICY "Permitir Update Usuario Autenticado Logos"
        ON storage.objects FOR UPDATE
        TO authenticated
        USING (bucket_id = 'logos')
        WITH CHECK (bucket_id = 'logos');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'Permitir Delete Usuario Autenticado Logos'
          AND tablename = 'objects'
          AND schemaname = 'storage'
    ) THEN
        CREATE POLICY "Permitir Delete Usuario Autenticado Logos"
        ON storage.objects FOR DELETE
        TO authenticated
        USING (bucket_id = 'logos');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'Permitir Back-End Service Role Total Logos'
          AND tablename = 'objects'
          AND schemaname = 'storage'
    ) THEN
        CREATE POLICY "Permitir Back-End Service Role Total Logos"
        ON storage.objects FOR ALL
        TO service_role
        USING (bucket_id = 'logos')
        WITH CHECK (bucket_id = 'logos');
    END IF;
END $$;
