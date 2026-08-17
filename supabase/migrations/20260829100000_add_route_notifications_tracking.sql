-- Migration: Adicionar travas e flags de notificação em rotas para pais
-- Data: 2026-08-29

-- 1. Flag de controle de envio na execução da rota (escolhido pelo motorista no modal ao iniciar)
ALTER TABLE execucoes_rota ADD COLUMN IF NOT EXISTS notificar_pais BOOLEAN NOT NULL DEFAULT true;

-- 2. Flag de controle anti-duplicidade e reordenação para aviso "Van a caminho"
ALTER TABLE execucoes_rota_passageiros ADD COLUMN IF NOT EXISTS notificacao_a_caminho_enviada BOOLEAN NOT NULL DEFAULT false;

-- 3. Flag de controle anti-duplicidade para aviso de conclusão "Embarcado/Desembarcado"
ALTER TABLE execucoes_rota_passageiros ADD COLUMN IF NOT EXISTS notificacao_concluido_enviada BOOLEAN NOT NULL DEFAULT false;
