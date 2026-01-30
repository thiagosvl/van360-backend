-- Migration: Create Storage Bucket for Receipts and Configure RLS
-- Date: 2024-01-20

-- 1. Create the bucket 'recibos' if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('recibos', 'recibos', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Enable Row Level Security (RLS) on storage.objects
-- REMOVED: Managed by Supabase internally. Attempting to run this causes "must be owner" error.
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies on 'recibos' to avoid conflicts
DROP POLICY IF EXISTS "Permitir Back-End Service Role Total" ON storage.objects;
DROP POLICY IF EXISTS "Permitir Leitura Publica Recibos" ON storage.objects;
DROP POLICY IF EXISTS "Permitir Upload Publico Recibos" ON storage.objects;

-- 4. Policy: Allow Public Upload (INSERT) to 'recibos' bucket
-- Necessary because backend upload was failing with Service Role in some environments.
CREATE POLICY "Permitir Upload Publico Recibos"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'recibos');

-- 5. Policy: Allow Public Read (SELECT) on 'recibos' bucket
-- Necessary for users to access the receipt URL.
CREATE POLICY "Permitir Leitura Publica Recibos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'recibos');

-- 6. Policy: Allow Full Access for Service Role (Backend/Admin)
-- Best practice for backend operations.
CREATE POLICY "Permitir Back-End Service Role Total"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'recibos')
WITH CHECK (bucket_id = 'recibos');


-- Storage bucket para contratos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('contratos', 'contratos', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de acesso ao storage
CREATE POLICY "Usuarios podem fazer upload de contratos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'contratos');

CREATE POLICY "Contratos são publicamente acessíveis"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'contratos');

CREATE POLICY "Usuarios podem atualizar seus contratos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'contratos');

CREATE POLICY "Usuarios podem deletar seus contratos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'contratos');