-- Migration: 20261103160000_add_fretamento_id_to_gastos.sql
-- Vincula despesas da tabela global 'gastos' a fretamentos e passeios

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'gastos' 
          AND column_name = 'fretamento_id'
    ) THEN
        ALTER TABLE public.gastos
        ADD COLUMN fretamento_id UUID REFERENCES public.fretamentos(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_gastos_fretamento_id ON public.gastos(fretamento_id);
