-- Tabela para rastrear notificações de assinaturas (Motoristas)
-- Evita spam e controla fluxo de renovação

CREATE TABLE IF NOT EXISTS assinatura_notificacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assinatura_cobranca_id UUID REFERENCES assinaturas_cobrancas(id) ON DELETE CASCADE,
    tipo_evento VARCHAR(50) NOT NULL, -- 'RENEWAL_DUE_SOON', 'RENEWAL_DUE_TODAY', 'RENEWAL_OVERDUE', 'ACCESS_SUSPENDED'
    canal VARCHAR(20) DEFAULT 'WHATSAPP',
    data_envio TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    usuario_id UUID REFERENCES usuarios(id) -- Opcional, para facilitar query por user
);

CREATE INDEX IF NOT EXISTS idx_ass_notificacoes_cobranca ON assinatura_notificacoes(assinatura_cobranca_id, tipo_evento);
