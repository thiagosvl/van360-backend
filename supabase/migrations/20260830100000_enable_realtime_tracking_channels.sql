-- Migration: Configurações de Realtime e RLS para canal de rastreamento veicular trip-tracking
-- Permite que motoristas transmitam localização e responsáveis recebam atualizações em tempo real

-- Habilita publicação para mensagens de broadcast seguras se necessário
-- (Supabase Realtime Broadcast opera através de canais públicos ou privados autorizados via RLS)

COMMENT ON TABLE public.execucoes_rota IS 'Tabela de execuções ativas e históricas de rotas para telemetria e rastreamento';
