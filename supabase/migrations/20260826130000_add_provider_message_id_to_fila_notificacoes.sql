-- Migration: Adicionar coluna genérica provider_message_id na tabela fila_notificacoes

ALTER TABLE fila_notificacoes ADD COLUMN IF NOT EXISTS provider_message_id VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_fila_notif_provider_msg_id ON fila_notificacoes(provider_message_id);
