-- Migration: Add dispositivo_cadastro and metadados_cadastro to usuarios table

ALTER TABLE public.usuarios 
  ADD COLUMN IF NOT EXISTS dispositivo_cadastro VARCHAR(50),
  ADD COLUMN IF NOT EXISTS metadados_cadastro JSONB DEFAULT '{}'::jsonb;

-- Check constraint for dispositivo_cadastro enum
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_dispositivo_cadastro_check;

ALTER TABLE public.usuarios 
  ADD CONSTRAINT usuarios_dispositivo_cadastro_check 
  CHECK (dispositivo_cadastro IS NULL OR dispositivo_cadastro IN ('APP_ANDROID', 'APP_IOS', 'WEB_MOBILE_ANDROID', 'WEB_MOBILE_IOS', 'WEB_DESKTOP'));
