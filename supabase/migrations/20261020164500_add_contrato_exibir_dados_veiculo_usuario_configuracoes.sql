DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'usuario_configuracoes' 
          AND column_name = 'contrato_exibir_dados_veiculo'
    ) THEN
        ALTER TABLE public.usuario_configuracoes 
        ADD COLUMN contrato_exibir_dados_veiculo BOOLEAN NOT NULL DEFAULT true;
    END IF;
END $$;

INSERT INTO public.usuario_configuracoes (usuario_id, contrato_exibir_dados_veiculo) 
SELECT id, true FROM public.usuarios 
ON CONFLICT (usuario_id) DO UPDATE SET contrato_exibir_dados_veiculo = COALESCE(public.usuario_configuracoes.contrato_exibir_dados_veiculo, true);
