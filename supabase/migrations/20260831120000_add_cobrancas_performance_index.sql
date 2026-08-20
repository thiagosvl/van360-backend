-- Migration: Criar índice composto de performance para a rotina diária de notificações de cobrança
-- Otimiza a consulta por status PENDENTE e datas de vencimento

CREATE INDEX IF NOT EXISTS idx_cobrancas_pendentes_notif 
ON cobrancas (status, data_vencimento, data_envio_ultima_notificacao);
