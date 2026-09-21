-- Adiciona coluna de observacao interna na tabela de cobrancas
ALTER TABLE cobrancas
ADD COLUMN IF NOT EXISTS observacao TEXT NULL;

COMMENT ON COLUMN cobrancas.observacao IS 'Observações ou notas internas do motorista sobre a cobrança';
