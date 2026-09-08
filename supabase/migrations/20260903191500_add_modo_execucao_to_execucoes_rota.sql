ALTER TABLE public.execucoes_rota 
ADD COLUMN IF NOT EXISTS modo_execucao VARCHAR(30) DEFAULT 'passo_a_passo' NOT NULL;
