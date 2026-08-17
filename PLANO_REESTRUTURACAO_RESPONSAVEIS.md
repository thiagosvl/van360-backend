# Plano de Reestruturação da Arquitetura de Responsáveis e Autenticação N:N

## 📌 Contexto & Objetivo
Atualmente, os dados do responsável (`nome`, `telefone`, `cpf`, `email`, `pin_acesso`) ficam duplicados diretamente na tabela `passageiros` (para o responsável principal) e na tabela `passageiro_responsaveis_adicionais` (para os adicionais).

Isso gera furos de inconsistência:
1. Se um pai possui 2 filhos cadastrados (inclusive em vans de motoristas diferentes), o PIN de acesso é duplicado em múltiplos registros no banco de dados.
2. Se um motorista redefinir o PIN de um filho, apenas aquele registro tinha o PIN zerado, impedindo o pai de recadastrar o PIN global.
3. Se um novo filho for cadastrado posteriormente, o novo registro nascia com PIN nulo, dessincronizando da credencial do pai.

**Objetivo:** Criar a tabela central de `responsaveis` (1 pessoa física = 1 número de telefone = 1 PIN único de acesso) e a tabela pivô `passageiro_responsaveis` (relacionamento N:N entre passageiros e responsáveis).

---

## 🗄️ 1. Alterações no Banco de Dados (Supabase Migration)

### A. Tabela Central `responsaveis`
```sql
CREATE TABLE IF NOT EXISTS responsaveis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone TEXT UNIQUE NOT NULL, -- Telefone limpo (apenas dígitos)
  nome TEXT NOT NULL,
  cpf TEXT,
  email TEXT,
  pin_acesso TEXT, -- Fonte única de verdade do PIN bcrypt do pai
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### B. Tabela Pivô N:N `passageiro_responsaveis`
```sql
CREATE TABLE IF NOT EXISTS passageiro_responsaveis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passageiro_id UUID NOT NULL REFERENCES passageiros(id) ON DELETE CASCADE,
  responsavel_id UUID NOT NULL REFERENCES responsaveis(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'principal', -- 'principal' ou 'adicional'
  parentesco TEXT, -- 'pai', 'mae', 'outro', etc.
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_passageiro_responsavel UNIQUE (passageiro_id, responsavel_id)
);
```

### C. Migration DML (Migração dos Dados Existentes)
```sql
-- 1. Popula a tabela responsaveis com os 115 responsáveis únicos da tabela passageiros
INSERT INTO responsaveis (telefone, nome, cpf, email, pin_acesso)
SELECT DISTINCT ON (regexp_replace(telefone_responsavel, '\D', '', 'g'))
  regexp_replace(telefone_responsavel, '\D', '', 'g') AS telefone,
  nome_responsavel AS nome,
  cpf_responsavel AS cpf,
  email_responsavel AS email,
  pin_acesso
FROM passageiros
WHERE telefone_responsavel IS NOT NULL AND regexp_replace(telefone_responsavel, '\D', '', 'g') <> ''
ON CONFLICT (telefone) DO NOTHING;

-- 2. Popula a tabela pivô passageiro_responsaveis para os passageiros atuais
INSERT INTO passageiro_responsaveis (passageiro_id, responsavel_id, tipo, parentesco)
SELECT 
  p.id AS passageiro_id,
  r.id AS responsavel_id,
  'principal' AS tipo,
  COALESCE(p.parentesco_responsavel::text, 'outro') AS parentesco
FROM passageiros p
JOIN responsaveis r ON regexp_replace(p.telefone_responsavel, '\D', '', 'g') = r.telefone
ON CONFLICT (passageiro_id, responsavel_id) DO NOTHING;

-- 3. Adiciona coluna responsavel_id em passageiros para compatibilidade direta
ALTER TABLE passageiros ADD COLUMN IF NOT EXISTS responsavel_id UUID REFERENCES responsaveis(id) ON DELETE SET NULL;

UPDATE passageiros p
SET responsavel_id = r.id
FROM responsaveis r
WHERE regexp_replace(p.telefone_responsavel, '\D', '', 'g') = r.telefone;

-- 4. A tabela passageiro_responsaveis_adicionais (que possui 0 registros) pode ser descontinuada
```

---

## ⚙️ 2. Alterações no Backend (`van360-backend`)

### A. Repository `responsavel.repository.ts`
- **`findPassageirosByPhone(phoneDigits)`**: Realiza a busca unificada através do JOIN: `responsaveis -> passageiro_responsaveis -> passageiros -> usuario:usuarios` (motorista).
- Retorna todos os alunos do pai (seja ele principal ou adicional) com o `pin_acesso` vindo diretamente da tabela central `responsaveis`.
- **`updatePin` e `resetPin`**: Atualizam diretamente a linha correspondente em `responsaveis` (`WHERE telefone = phoneDigits` ou `WHERE id = responsavel_id`).

### B. Service `passageiro.service.ts` & `pre-passageiro.service.ts`
- Ao cadastrar/editar um passageiro ou responsável adicional:
  1. Extrai e limpa o número de telefone do responsável.
  2. Procura ou insere o responsável na tabela `responsaveis` (`upsert` / `findOrCreate`).
  3. Insere/atualiza o vínculo na tabela pivô `passageiro_responsaveis`.
  4. Mantém atualizadas as colunas de compatibilidade na tabela `passageiros` para relatórios, WhatsApp e cobranças.

### C. Service `responsavel.service.ts` (Login e Autenticação do Pai)
- **`checkPhone`**: Consulta `responsaveis` pelo telefone limpo. Retorna `hasPin = Boolean(responsavel.pin_acesso)`.
- **`login`**: Valida a senha contra `responsavel.pin_acesso` (1 única verificação).
- **`setupPin`**: Atualiza `responsaveis.pin_acesso = hash` (1 único update).
- **`resetPinByDriver` / `resetPinByPhone`**: Limpa `responsaveis.pin_acesso = null` (1 único update).

---

## 📱 3. Compatibilidade com o Front-end (`van360`)

- **Zero Breaking Changes:** O front-end continuará enviando e recebendo os mesmos DTOs e formulários.
- A tela *"Selecione o Passageiro"* continuará exibindo perfeitamente todos os alunos vinculados ao responsável, mesmo que pertencentes a motoristas e vans diferentes.

---

## 🧪 4. Validação & Testes

1. Executar as migrations SQL no Supabase.
2. Rodar `npx tsc --noEmit` no `van360-backend` para garantir 0 erros de compilação.
3. Testar os fluxos:
   - Login do responsável por telefone + PIN.
   - Primeiro acesso / cadastro de PIN.
   - Redefinição de PIN pelo motorista.
   - Seleção e alternância de alunos em motoristas diferentes.
