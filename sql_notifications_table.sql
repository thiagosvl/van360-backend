-- Tabela para rastrear notificações enviadas e evitar spam
CREATE TABLE IF NOT EXISTS historico_notificacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cobranca_id UUID REFERENCES cobrancas(id) ON DELETE CASCADE,
    tipo VARCHAR(50) NOT NULL, -- 'VENCIMENTO_PRÓXIMO', 'ATRASO', 'CONFIRMACAO_PAGAMENTO'
    canal VARCHAR(20) DEFAULT 'WHATSAPP',
    destinatario VARCHAR(20),
    mensagem TEXT,
    status VARCHAR(20) DEFAULT 'ENVIADA', -- 'ENVIADA', 'FALHA'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Índice para busca rápida por cobrança e tipo
CREATE INDEX IF NOT EXISTS idx_notificacoes_cobranca_tipo ON historico_notificacoes(cobranca_id, tipo);
