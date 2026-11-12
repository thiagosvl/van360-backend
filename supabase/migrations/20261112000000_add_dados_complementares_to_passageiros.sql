DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'passageiros' 
          AND column_name = 'dados_complementares'
    ) THEN
        ALTER TABLE public.passageiros 
        ADD COLUMN dados_complementares JSONB NOT NULL DEFAULT '[]'::jsonb;
    END IF;

    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'pre_passageiros' 
          AND column_name = 'dados_complementares'
    ) THEN
        ALTER TABLE public.pre_passageiros 
        ADD COLUMN dados_complementares JSONB NOT NULL DEFAULT '[]'::jsonb;
    END IF;
END $$;
