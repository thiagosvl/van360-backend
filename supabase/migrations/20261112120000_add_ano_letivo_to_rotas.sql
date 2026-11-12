ALTER TABLE public.rotas
ADD COLUMN IF NOT EXISTS ano_letivo INTEGER NOT NULL DEFAULT 2026;

CREATE INDEX IF NOT EXISTS idx_rotas_usuario_id_ano_letivo
ON public.rotas (usuario_id, ano_letivo);
