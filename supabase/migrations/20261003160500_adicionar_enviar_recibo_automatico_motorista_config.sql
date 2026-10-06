ALTER TABLE motorista_configuracoes_financeiras
ADD COLUMN IF NOT EXISTS enviar_recibo_automatico BOOLEAN NOT NULL DEFAULT true;
