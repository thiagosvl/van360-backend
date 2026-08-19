-- Migration: Adicionar rastreamento de notificacao_inicio_enviada nas paradas da execução da rota
-- Descrição: Permite controlar a idempotência do envio de notificação de início de rota (Ida e Volta por Escola)

ALTER TABLE execucoes_rota_passageiros ADD COLUMN IF NOT EXISTS notificacao_inicio_enviada BOOLEAN NOT NULL DEFAULT false;
