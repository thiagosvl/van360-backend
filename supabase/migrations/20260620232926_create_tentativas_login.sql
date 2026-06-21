-- Migration para criar a tabela tentativas_login

CREATE TABLE IF NOT EXISTS public.tentativas_login (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  login_tentado varchar NOT NULL,
  ip varchar,
  user_agent text,
  dispositivo varchar,
  sucesso boolean NOT NULL DEFAULT false,
  motivo_falha varchar,
  created_at timestamptz DEFAULT now()
);

-- Ativar RLS
ALTER TABLE public.tentativas_login ENABLE ROW LEVEL SECURITY;

-- Politicas
-- Apenas admin pode ver as tentativas de login (se quisermos limitar)
CREATE POLICY "Enable read access for authenticated admins only" 
ON public.tentativas_login 
FOR SELECT 
TO authenticated 
USING ( (SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'ADMIN' );

-- Apenas o service role (backend) pode inserir
CREATE POLICY "Enable insert for service_role only" 
ON public.tentativas_login 
FOR INSERT 
TO service_role 
WITH CHECK (true);
