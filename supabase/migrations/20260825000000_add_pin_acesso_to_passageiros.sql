ALTER TABLE passageiros ADD COLUMN IF NOT EXISTS pin_acesso TEXT DEFAULT NULL;
ALTER TABLE passageiro_responsaveis_adicionais ADD COLUMN IF NOT EXISTS pin_acesso TEXT DEFAULT NULL;
