-- Migration: Adicionar preferências de notificação de rotas e rastreamento GPS
-- Descrição: Configurações do motorista em usuario_configuracoes e snapshot em execucoes_rota

-- 1. Preferências globais do motorista
ALTER TABLE public.usuario_configuracoes 
  ADD COLUMN IF NOT EXISTS notificar_inicio_rota BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notificar_proxima_parada BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notificar_conclusao_parada BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rastreamento_ativo BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rastreamento_modo VARCHAR(30) NOT NULL DEFAULT 'completo';

-- 2. Snapshot imutável na execução da rota
ALTER TABLE public.execucoes_rota 
  ADD COLUMN IF NOT EXISTS notificar_inicio_rota BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notificar_proxima_parada BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notificar_conclusao_parada BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rastreamento_ativo BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rastreamento_modo VARCHAR(30) NOT NULL DEFAULT 'completo';
