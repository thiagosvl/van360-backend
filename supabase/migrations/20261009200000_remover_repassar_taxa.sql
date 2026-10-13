-- Migration: Remover flags e colunas de repasse de taxa aos pais
-- O valor cobrado do pai passa a ser exclusivamente o valor da parcela, com a taxa sendo descontada no repasse.

ALTER TABLE public.motorista_configuracoes_financeiras
DROP COLUMN IF EXISTS repassar_taxa_pais_padrao;

ALTER TABLE public.passageiros
DROP COLUMN IF EXISTS repassar_taxa_pai;

ALTER TABLE public.cobrancas
DROP COLUMN IF EXISTS taxa_repassada_ao_pai;
