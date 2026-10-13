-- Migration: Unificar modelo de cobrança (Split Woovi) e consolidar status
-- Data: 2026-10-09

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'modo_cobranca_enum') THEN
        CREATE TYPE public.modo_cobranca_enum AS ENUM (
            'DESATIVADO',
            'LEMBRETES',
            'AUTOMATICA'
        );
    END IF;
END $$;

ALTER TABLE public.motorista_configuracoes_financeiras
    ADD COLUMN IF NOT EXISTS modo_cobranca public.modo_cobranca_enum NOT NULL DEFAULT 'DESATIVADO';

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'motorista_configuracoes_financeiras' 
          AND column_name = 'cobranca_automatica_ativa'
    ) THEN
        EXECUTE '
            UPDATE public.motorista_configuracoes_financeiras
            SET modo_cobranca = ''AUTOMATICA''
            WHERE cobranca_automatica_ativa = true;
        ';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'usuario_configuracoes' 
          AND column_name = 'notificar_pais_cobrancas'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'motorista_configuracoes_financeiras' 
          AND column_name = 'cobranca_automatica_ativa'
    ) THEN
        EXECUTE '
            UPDATE public.motorista_configuracoes_financeiras mcf
            SET modo_cobranca = ''LEMBRETES''
            FROM public.usuario_configuracoes uc
            WHERE mcf.usuario_id = uc.usuario_id
              AND mcf.cobranca_automatica_ativa = false
              AND uc.notificar_pais_cobrancas = true;
        ';
    END IF;
END $$;
