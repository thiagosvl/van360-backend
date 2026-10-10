-- Migration: Unificar modo_cobranca em passageiros e remover cobranca_automatica_ativa
-- Data: 2026-10-09

ALTER TABLE public.passageiros
    ADD COLUMN IF NOT EXISTS modo_cobranca public.modo_cobranca_enum DEFAULT NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'passageiros' 
          AND column_name = 'cobranca_automatica_ativa'
    ) THEN
        EXECUTE '
            UPDATE public.passageiros
            SET modo_cobranca = ''AUTOMATICA''
            WHERE cobranca_automatica_ativa = true;

            UPDATE public.passageiros
            SET modo_cobranca = ''DESATIVADO''
            WHERE cobranca_automatica_ativa = false;
        ';
    END IF;
END $$;

ALTER TABLE public.passageiros
    DROP COLUMN IF EXISTS cobranca_automatica_ativa;
