-- 1. Ensure the bucket exists and is Public
INSERT INTO storage.buckets (id, name, public) 
VALUES ('recibos', 'recibos', true) 
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. "Permissive Policy" instead of Disabling RLS
-- This achieves the same result (Service Role can do everything) without requiring Table Owner permissions.
-- We drop existing policies first to avoid conflicts if you run this multiple times.

DROP POLICY IF EXISTS "Service Role Full Access" ON storage.objects;
CREATE POLICY "Service Role Full Access"
ON storage.objects
FOR ALL
TO service_role
USING ( true )
WITH CHECK ( true );

DROP POLICY IF EXISTS "Public Read Access" ON storage.objects;
CREATE POLICY "Public Read Access"
ON storage.objects
FOR SELECT
TO public
USING ( bucket_id = 'recibos' );
