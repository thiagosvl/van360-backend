-- Migration: Add dispositivo_cadastro and metadados_cadastro to pre_passageiros table

ALTER TABLE public.pre_passageiros 
  ADD COLUMN IF NOT EXISTS dispositivo_cadastro VARCHAR(50),
  ADD COLUMN IF NOT EXISTS metadados_cadastro JSONB DEFAULT '{}'::jsonb;
