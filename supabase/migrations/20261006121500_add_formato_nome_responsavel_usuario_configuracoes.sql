-- Migration: Adicionar formato_nome_responsavel na tabela usuario_configuracoes
-- Data: 2026-10-06

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'usuario_configuracoes' 
          AND column_name = 'formato_nome_responsavel'
    ) THEN
        ALTER TABLE public.usuario_configuracoes 
        ADD COLUMN formato_nome_responsavel TEXT NOT NULL DEFAULT 'primeiro_nome';

        ALTER TABLE public.usuario_configuracoes 
        ADD CONSTRAINT check_formato_nome_responsavel 
        CHECK (formato_nome_responsavel IN ('primeiro_nome', 'completo'));
    END IF;
END $$;

-- Garantir que todos os usuários tenham registro na tabela com o padrão correto
INSERT INTO public.usuario_configuracoes (usuario_id, formato_nome_responsavel) 
SELECT id, 'primeiro_nome' FROM public.usuarios 
ON CONFLICT (usuario_id) DO UPDATE SET formato_nome_responsavel = COALESCE(public.usuario_configuracoes.formato_nome_responsavel, 'primeiro_nome');
