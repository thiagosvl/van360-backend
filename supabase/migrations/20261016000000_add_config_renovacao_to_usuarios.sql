-- Adiciona coluna config_renovacao na tabela usuarios
ALTER TABLE public.usuarios
ADD COLUMN IF NOT EXISTS config_renovacao JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.usuarios.config_renovacao IS 'Configurações de renovação anual por ano letivo (período mestre de cobrança e datas de transporte)';
