ALTER TABLE public.assinaturas
ADD COLUMN IF NOT EXISTS trial_estendido BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_assinaturas_trial_estendido 
ON public.assinaturas (trial_estendido) 
WHERE status = 'TRIAL';
