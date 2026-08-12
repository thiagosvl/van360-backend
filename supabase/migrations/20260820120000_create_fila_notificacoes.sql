-- Migration: Criar Tabela da Fila de Notificações Resiliente (Outbox Pattern)

CREATE TABLE IF NOT EXISTS fila_notificacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
    canal VARCHAR(20) NOT NULL, -- 'RESEND', 'WABA', 'FIREBASE', 'TELEGRAM'
    evento VARCHAR(100) NOT NULL, -- 'PASSAGEIRO_CONTRATO_ASSINADO', 'MOTORISTA_ASSINATURA_FALHA_CARTAO', etc.
    destinatario VARCHAR(255) NOT NULL, -- email ou telefone
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'SENT', 'PROCESSING', 'RETRY_PENDING', 'FAILED', 'CANCELLED'
    tentativas INT NOT NULL DEFAULT 0,
    max_tentativas INT NOT NULL DEFAULT 3,
    proxima_tentativa_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload JSONB NOT NULL, -- Snapshot congelado do contexto de dados
    erro_mensagem TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices de alta performance
CREATE INDEX IF NOT EXISTS idx_fila_notif_retry ON fila_notificacoes(status, proxima_tentativa_em) WHERE status = 'RETRY_PENDING';
CREATE INDEX IF NOT EXISTS idx_fila_notif_usuario ON fila_notificacoes(usuario_id);
