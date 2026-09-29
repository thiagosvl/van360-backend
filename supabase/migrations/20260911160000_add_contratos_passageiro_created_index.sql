CREATE INDEX IF NOT EXISTS idx_contratos_passageiro_created ON public.contratos (passageiro_id, created_at DESC);
