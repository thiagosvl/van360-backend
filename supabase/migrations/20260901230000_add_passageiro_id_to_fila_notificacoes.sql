-- Migration: Adicionar coluna passageiro_id na tabela fila_notificacoes com backfill retroativo

ALTER TABLE fila_notificacoes 
ADD COLUMN IF NOT EXISTS passageiro_id UUID REFERENCES passageiros(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fila_notificacoes_passageiro_id 
ON fila_notificacoes(passageiro_id);

-- Backfill 1: Notificações de rotas que já possuem passageiroId válido no payload JSON
UPDATE fila_notificacoes
SET passageiro_id = (payload->>'passageiroId')::uuid
WHERE passageiro_id IS NULL
  AND payload->>'passageiroId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1 FROM passageiros p WHERE p.id = (payload->>'passageiroId')::uuid
  );

-- Backfill 2: Notificações de cobrança cruzando cobrancaId com a tabela cobrancas
UPDATE fila_notificacoes f
SET passageiro_id = c.passageiro_id
FROM cobrancas c
WHERE f.passageiro_id IS NULL
  AND f.payload->>'cobrancaId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (f.payload->>'cobrancaId')::uuid = c.id
  AND c.passageiro_id IS NOT NULL;

-- Backfill 3: Notificações de contratos disponíveis cruzando o token_acesso presente no link de assinatura
UPDATE fila_notificacoes f
SET passageiro_id = c.passageiro_id
FROM contratos c
WHERE f.passageiro_id IS NULL
  AND f.payload->>'linkAssinatura' IS NOT NULL
  AND f.payload->>'linkAssinatura' LIKE '%' || c.token_acesso || '%'
  AND c.passageiro_id IS NOT NULL;

-- Backfill 4: Notificações de recibos e contratos assinados cruzando motorista (usuario_id) e nome do passageiro
UPDATE fila_notificacoes f
SET passageiro_id = p.id
FROM passageiros p
WHERE f.passageiro_id IS NULL
  AND f.usuario_id IS NOT NULL
  AND f.usuario_id = p.usuario_id
  AND f.payload->>'nomePassageiro' IS NOT NULL
  AND TRIM(LOWER(p.nome)) = TRIM(LOWER(f.payload->>'nomePassageiro'));
