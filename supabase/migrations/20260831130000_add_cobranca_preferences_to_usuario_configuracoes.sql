-- Migration: Adicionar preferências granulares de cobrança na tabela usuario_configuracoes
-- Permite que o motorista personalize o aviso prévio (1 a 5 dias), vencimento no dia e atrasos de 3, 5 e 7 dias individualmente

ALTER TABLE public.usuario_configuracoes 
ADD COLUMN IF NOT EXISTS cobranca_aviso_previo_ativo BOOLEAN DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS cobranca_dias_aviso_previo INTEGER CHECK (cobranca_dias_aviso_previo IS NULL OR (cobranca_dias_aviso_previo >= 1 AND cobranca_dias_aviso_previo <= 5)),
ADD COLUMN IF NOT EXISTS cobranca_vencimento_hoje_ativo BOOLEAN DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS cobranca_atraso_3_dias_ativo BOOLEAN DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS cobranca_atraso_5_dias_ativo BOOLEAN DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS cobranca_atraso_7_dias_ativo BOOLEAN DEFAULT true NOT NULL;
