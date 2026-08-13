-- Migration: Adicionar coluna email_responsavel em passageiros e pre_passageiros, e email em passageiro_responsaveis_adicionais

ALTER TABLE public.passageiros 
ADD COLUMN IF NOT EXISTS email_responsavel text;

ALTER TABLE public.pre_passageiros 
ADD COLUMN IF NOT EXISTS email_responsavel text;

ALTER TABLE public.passageiro_responsaveis_adicionais 
ADD COLUMN IF NOT EXISTS email text;
