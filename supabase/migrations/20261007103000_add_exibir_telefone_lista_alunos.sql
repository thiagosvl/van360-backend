-- Migration: Adicionar exibir_telefone_lista_alunos na tabela usuario_configuracoes
-- Data: 2026-10-07

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'usuario_configuracoes' 
          AND column_name = 'exibir_telefone_lista_alunos'
    ) THEN
        ALTER TABLE public.usuario_configuracoes 
        ADD COLUMN exibir_telefone_lista_alunos BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;
