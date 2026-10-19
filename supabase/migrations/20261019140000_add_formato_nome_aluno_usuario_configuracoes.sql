DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'usuario_configuracoes' 
          AND column_name = 'formato_nome_aluno'
    ) THEN
        ALTER TABLE public.usuario_configuracoes 
        ADD COLUMN formato_nome_aluno TEXT NOT NULL DEFAULT 'curto';

        ALTER TABLE public.usuario_configuracoes 
        ADD CONSTRAINT check_formato_nome_aluno 
        CHECK (formato_nome_aluno IN ('curto', 'completo'));
    END IF;
END $$;

INSERT INTO public.usuario_configuracoes (usuario_id, formato_nome_aluno) 
SELECT id, 'curto' FROM public.usuarios 
ON CONFLICT (usuario_id) DO UPDATE SET formato_nome_aluno = COALESCE(public.usuario_configuracoes.formato_nome_aluno, 'curto');
