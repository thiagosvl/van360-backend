-- Migration: Remover colunas e tipos obsoletos de BaaS e subcontas não utilizados
-- Data: 2026-10-09

ALTER TABLE public.motorista_configuracoes_financeiras
    DROP COLUMN IF EXISTS baas_status,
    DROP COLUMN IF EXISTS baas_account_id,
    DROP COLUMN IF EXISTS baas_kyc_url,
    DROP COLUMN IF EXISTS baas_motivo_pendencia,
    DROP COLUMN IF EXISTS baas_agencia,
    DROP COLUMN IF EXISTS baas_conta,
    DROP COLUMN IF EXISTS baas_banco,
    DROP COLUMN IF EXISTS subconta_provedor_id;

DROP TYPE IF EXISTS public.baas_status_enum CASCADE;
