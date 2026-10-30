ALTER TYPE provedor_pagamento_enum ADD VALUE IF NOT EXISTS 'BANCO_DO_BRASIL';

ALTER TABLE cobrancas
  ADD COLUMN IF NOT EXISTS boleto_linha_digitavel TEXT NULL,
  ADD COLUMN IF NOT EXISTS boleto_codigo_barras TEXT NULL,
  ADD COLUMN IF NOT EXISTS boleto_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS boleto_nosso_numero TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_cobrancas_boleto_nosso_numero ON cobrancas (boleto_nosso_numero);

ALTER TABLE motorista_configuracoes_financeiras
  ADD COLUMN IF NOT EXISTS provedor_ativo provedor_pagamento_enum DEFAULT 'WOOVI',
  ADD COLUMN IF NOT EXISTS provedor_config JSONB DEFAULT '{}'::jsonb;
