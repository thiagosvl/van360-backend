-- Adicionar coluna de recibo nas cobranças de passageiros
ALTER TABLE public.cobrancas ADD COLUMN IF NOT EXISTS recibo_url TEXT;

-- Adicionar coluna de recibo nas cobranças de assinaturas (motoristas)
ALTER TABLE public.assinaturas_cobrancas ADD COLUMN IF NOT EXISTS recibo_url TEXT;

-- Nota: O bucket 'recibos' deve ser criado no Dashboard do Supabase ou via API de storage
