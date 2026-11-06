DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'usuario_configuracoes' 
          AND column_name = 'campos_formulario_externo'
    ) THEN
        ALTER TABLE public.usuario_configuracoes 
        ADD COLUMN campos_formulario_externo JSONB NOT NULL DEFAULT '{"turma": false, "data_nascimento": true, "genero": true, "periodo": true, "modalidade": true, "parentesco_responsavel": true, "email_responsavel": true}'::jsonb;
    END IF;
END $$;

ALTER TABLE public.usuario_configuracoes 
ALTER COLUMN campos_formulario_externo SET DEFAULT '{"turma": false, "data_nascimento": true, "genero": true, "periodo": true, "modalidade": true, "parentesco_responsavel": true, "email_responsavel": true}'::jsonb;

UPDATE public.usuario_configuracoes
SET campos_formulario_externo = jsonb_set(
    COALESCE(campos_formulario_externo, '{}'::jsonb),
    '{email_responsavel}',
    'true'::jsonb,
    true
)
WHERE campos_formulario_externo IS NOT NULL AND NOT (campos_formulario_externo ? 'email_responsavel');
