-- Migration: Reestruturação da Arquitetura de Responsáveis (N:N)
-- Data: 2026-08-28

-- 1. Criação da Tabela Central `responsaveis`
CREATE TABLE IF NOT EXISTS responsaveis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  cpf TEXT,
  email TEXT,
  pin_acesso TEXT,
  logradouro TEXT,
  numero TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT,
  cep TEXT,
  referencia TEXT,
  complemento TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Criação da Tabela Pivô `passageiro_responsaveis`
CREATE TABLE IF NOT EXISTS passageiro_responsaveis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passageiro_id UUID NOT NULL REFERENCES passageiros(id) ON DELETE CASCADE,
  responsavel_id UUID NOT NULL REFERENCES responsaveis(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'principal', -- 'principal' | 'adicional'
  parentesco TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_passageiro_responsavel UNIQUE (passageiro_id, responsavel_id)
);

-- Indexação para busca ultra-rápida por vínculos (o campo telefone já tem índice B-Tree único automático)
CREATE INDEX IF NOT EXISTS idx_passageiro_responsaveis_pass ON passageiro_responsaveis(passageiro_id);
CREATE INDEX IF NOT EXISTS idx_passageiro_responsaveis_resp ON passageiro_responsaveis(responsavel_id);

-- 3. Popula a tabela responsaveis com os responsáveis existentes na tabela passageiros
INSERT INTO responsaveis (telefone, nome, cpf, email, pin_acesso, logradouro, numero, bairro, cidade, estado, cep, referencia, complemento)
SELECT DISTINCT ON (regexp_replace(telefone_responsavel, '\D', '', 'g'))
  regexp_replace(telefone_responsavel, '\D', '', 'g') AS telefone,
  COALESCE(nome_responsavel, 'Responsável') AS nome,
  cpf_responsavel AS cpf,
  email_responsavel AS email,
  pin_acesso,
  logradouro,
  numero,
  bairro,
  cidade,
  estado,
  cep,
  referencia,
  complemento
FROM passageiros
WHERE telefone_responsavel IS NOT NULL AND regexp_replace(telefone_responsavel, '\D', '', 'g') <> ''
ORDER BY regexp_replace(telefone_responsavel, '\D', '', 'g'),
         (pin_acesso IS NOT NULL) DESC,
         created_at DESC
ON CONFLICT (telefone) DO UPDATE SET
  nome = COALESCE(NULLIF(responsaveis.nome, ''), EXCLUDED.nome),
  cpf = COALESCE(responsaveis.cpf, EXCLUDED.cpf),
  email = COALESCE(responsaveis.email, EXCLUDED.email),
  pin_acesso = COALESCE(responsaveis.pin_acesso, EXCLUDED.pin_acesso),
  logradouro = COALESCE(responsaveis.logradouro, EXCLUDED.logradouro),
  numero = COALESCE(responsaveis.numero, EXCLUDED.numero),
  bairro = COALESCE(responsaveis.bairro, EXCLUDED.bairro),
  cidade = COALESCE(responsaveis.cidade, EXCLUDED.cidade),
  estado = COALESCE(responsaveis.estado, EXCLUDED.estado),
  cep = COALESCE(responsaveis.cep, EXCLUDED.cep),
  referencia = COALESCE(responsaveis.referencia, EXCLUDED.referencia),
  complemento = COALESCE(responsaveis.complemento, EXCLUDED.complemento);

-- 4. Popula a tabela pivô passageiro_responsaveis para os passageiros atuais
INSERT INTO passageiro_responsaveis (passageiro_id, responsavel_id, tipo, parentesco)
SELECT 
  p.id AS passageiro_id,
  r.id AS responsavel_id,
  'principal' AS tipo,
  COALESCE(p.parentesco_responsavel::text, 'outro') AS parentesco
FROM passageiros p
JOIN responsaveis r ON regexp_replace(p.telefone_responsavel, '\D', '', 'g') = r.telefone
ON CONFLICT (passageiro_id, responsavel_id) DO NOTHING;

-- 5. Se existirem registros na tabela de adicionais antiga, insere e vincula como 'adicional'
DO $$
DECLARE
  has_complemento BOOLEAN := FALSE;
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'passageiro_responsaveis_adicionais') THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'passageiro_responsaveis_adicionais' AND column_name = 'complemento'
    ) INTO has_complemento;

    IF has_complemento THEN
      EXECUTE '
        INSERT INTO responsaveis (telefone, nome, cpf, email, pin_acesso, logradouro, numero, bairro, cidade, estado, cep, referencia, complemento)
        SELECT DISTINCT ON (regexp_replace(telefone, ''\D'', '''', ''g''))
          regexp_replace(telefone, ''\D'', '''', ''g'') AS telefone,
          COALESCE(nome, ''Responsável'') AS nome,
          cpf, email, NULL, logradouro, numero, bairro, cidade, estado, cep, referencia, complemento
        FROM passageiro_responsaveis_adicionais
        WHERE telefone IS NOT NULL AND regexp_replace(telefone, ''\D'', '''', ''g'') <> ''''
        ORDER BY regexp_replace(telefone, ''\D'', '''', ''g''), created_at DESC
        ON CONFLICT (telefone) DO UPDATE SET
          nome = COALESCE(NULLIF(responsaveis.nome, ''''), EXCLUDED.nome),
          cpf = COALESCE(responsaveis.cpf, EXCLUDED.cpf),
          email = COALESCE(responsaveis.email, EXCLUDED.email),
          logradouro = COALESCE(responsaveis.logradouro, EXCLUDED.logradouro),
          numero = COALESCE(responsaveis.numero, EXCLUDED.numero),
          bairro = COALESCE(responsaveis.bairro, EXCLUDED.bairro),
          cidade = COALESCE(responsaveis.cidade, EXCLUDED.cidade),
          estado = COALESCE(responsaveis.estado, EXCLUDED.estado),
          cep = COALESCE(responsaveis.cep, EXCLUDED.cep),
          referencia = COALESCE(responsaveis.referencia, EXCLUDED.referencia),
          complemento = COALESCE(responsaveis.complemento, EXCLUDED.complemento);
      ';
    ELSE
      EXECUTE '
        INSERT INTO responsaveis (telefone, nome, cpf, email, pin_acesso, logradouro, numero, bairro, cidade, estado, cep, referencia)
        SELECT DISTINCT ON (regexp_replace(telefone, ''\D'', '''', ''g''))
          regexp_replace(telefone, ''\D'', '''', ''g'') AS telefone,
          COALESCE(nome, ''Responsável'') AS nome,
          cpf, email, NULL, logradouro, numero, bairro, cidade, estado, cep, referencia
        FROM passageiro_responsaveis_adicionais
        WHERE telefone IS NOT NULL AND regexp_replace(telefone, ''\D'', '''', ''g'') <> ''''
        ORDER BY regexp_replace(telefone, ''\D'', '''', ''g''), created_at DESC
        ON CONFLICT (telefone) DO UPDATE SET
          nome = COALESCE(NULLIF(responsaveis.nome, ''''), EXCLUDED.nome),
          cpf = COALESCE(responsaveis.cpf, EXCLUDED.cpf),
          email = COALESCE(responsaveis.email, EXCLUDED.email),
          logradouro = COALESCE(responsaveis.logradouro, EXCLUDED.logradouro),
          numero = COALESCE(responsaveis.numero, EXCLUDED.numero),
          bairro = COALESCE(responsaveis.bairro, EXCLUDED.bairro),
          cidade = COALESCE(responsaveis.cidade, EXCLUDED.cidade),
          estado = COALESCE(responsaveis.estado, EXCLUDED.estado),
          cep = COALESCE(responsaveis.cep, EXCLUDED.cep),
          referencia = COALESCE(responsaveis.referencia, EXCLUDED.referencia);
      ';
    END IF;

    INSERT INTO passageiro_responsaveis (passageiro_id, responsavel_id, tipo, parentesco)
    SELECT 
      a.passageiro_id AS passageiro_id,
      r.id AS responsavel_id,
      'adicional' AS tipo,
      COALESCE(a.parentesco::text, 'outro') AS parentesco
    FROM passageiro_responsaveis_adicionais a
    JOIN responsaveis r ON regexp_replace(a.telefone, '\D', '', 'g') = r.telefone
    ON CONFLICT (passageiro_id, responsavel_id) DO NOTHING;

    DROP TABLE passageiro_responsaveis_adicionais CASCADE;
  END IF;
END $$;

-- 6. Elimina as colunas legadas da tabela passageiros (dados do responsável e endereço)
ALTER TABLE passageiros DROP COLUMN IF EXISTS nome_responsavel;
ALTER TABLE passageiros DROP COLUMN IF EXISTS telefone_responsavel;
ALTER TABLE passageiros DROP COLUMN IF EXISTS cpf_responsavel;
ALTER TABLE passageiros DROP COLUMN IF EXISTS email_responsavel;
ALTER TABLE passageiros DROP COLUMN IF EXISTS parentesco_responsavel;
ALTER TABLE passageiros DROP COLUMN IF EXISTS pin_acesso;
ALTER TABLE passageiros DROP COLUMN IF EXISTS logradouro;
ALTER TABLE passageiros DROP COLUMN IF EXISTS numero;
ALTER TABLE passageiros DROP COLUMN IF EXISTS bairro;
ALTER TABLE passageiros DROP COLUMN IF EXISTS cidade;
ALTER TABLE passageiros DROP COLUMN IF EXISTS estado;
ALTER TABLE passageiros DROP COLUMN IF EXISTS cep;
ALTER TABLE passageiros DROP COLUMN IF EXISTS referencia;
ALTER TABLE passageiros DROP COLUMN IF EXISTS complemento;
