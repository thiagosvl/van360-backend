# Plano de Implementação — Máquina de Estados de Repasse (FSM)

> Opção B: Ledger dedicado + FSM com audit trail
> **Gateway ativo: C6 Bank.** Inter mantido como está (desatualizado, plano B futuro). Mock gateway será removido.

---

## Decisões de Projeto

- **Estado com nomenclatura C6** — os nomes `DECODIFICANDO`, `DECODIFICADO`, `SUBMETIDO` refletem o fluxo real do C6 (único gateway ativo). Quando o Inter for reativado no futuro, o mapa de transições será expandido.
- **Mock gateway removido** — Sempre usaremos C6 (produção ou sandbox). A rota `mock-pagamento` (ferramenta de dev que simula webhooks) continua existindo.
- **Inter gateway intocado** — Não mexeremos no `inter.provider.ts` nem no `inter.service.ts`. Ele ficará desatualizado mas funcional como referência futura.
- **`submeterGrupo`** — Permanece como chamada direta ao `c6Service` dentro do monitor. Quando Inter for reativado, moveremos para a interface `PaymentProvider`.

---

## Inventário de Impacto

### Backend — MODIFICAR/REESCREVER

| Arquivo | Ação | Motivo |
|---|---|---|
| `supabase/migrations/20240101000000_initial_schema.sql` | MODIFICAR | Remover colunas de repasse de `cobrancas`. Remover `transacoes_repasse`. Adicionar `repasses` + `repasse_transicoes`. Atualizar `anonymize_user_account`. |
| `src/types/enums.ts` | MODIFICAR | Substituir `RepasseStatus` + `TransactionStatus` por `RepasseState`. Remover `PaymentGateway.MOCK`. |
| `src/services/repasse-fsm.service.ts` | **CRIAR** | Core FSM: validador de transições, operações atômicas, audit trail. |
| `src/queues/payout.queue.ts` | MODIFICAR | `transacaoId` → `repasseId` em `PayoutJobData`. |
| `src/workers/payout.worker.ts` | REESCREVER | Usar FSM em vez de updates manuais. |
| `src/services/jobs/repasse-monitor.job.ts` | REESCREVER | Consultar `repasses`. Usar FSM. |
| `src/services/jobs/repasse-retry.job.ts` | REESCREVER | Buscar em `repasses`. Usar FSM. |
| `src/services/cobranca-pagamento.service.ts` | MODIFICAR | `iniciarRepasse()` via FSM. Remover refs a `status_repasse`. |
| `src/api/mock-pagamento.routes.ts` | MODIFICAR | Usar `repasses` em vez de `transacoes_repasse`. |
| `src/services/payment.service.ts` | MODIFICAR | Remover case `MOCK` e import do MockPaymentProvider. |
| `src/services/fee.service.ts` | MODIFICAR | Remover entrada `MOCK` da tabela de taxas. |

### Backend — DELETAR (Mock Gateway)

| Arquivo | Ação |
|---|---|
| `src/services/providers/mock.provider.ts` | **DELETAR** |
| `src/services/mock-automation.service.ts` | **DELETAR** |

### Frontend (`van-control`)

| Arquivo | Ação | Motivo |
|---|---|---|
| `src/types/enums.ts` | MODIFICAR | Substituir `RepasseStatus` por `RepasseState`. |
| `src/types/cobranca.ts` | MODIFICAR | Remover `status_repasse`. Adicionar tipo `Repasse`. |
| `src/utils/formatters/status.ts` | MODIFICAR | Atualizar labels/cores para novos estados. |
| `src/pages/PassageiroCobranca.tsx` | MODIFICAR | `cobranca.repasse?.estado` em vez de `cobranca.status_repasse`. |
| `src/components/.../CarteirinhaCobrancas.tsx` | MODIFICAR | Idem. |
| `src/components/.../CobrancasList.tsx` | MODIFICAR | Idem. |
| `src/components/.../PaymentTimeline.tsx` | MODIFICAR | Idem. |

---

## Etapa 1 — Banco de Dados + Enums

**Objetivo:** Criar a fundação: novas tabelas SQL e o enum unificado TypeScript.

### 1.1 Atualizar Schema SQL

**Adicionar** no final de `initial_schema.sql`:

```sql
-- =============================================
-- MÁQUINA DE ESTADOS DE REPASSE (FSM)
-- =============================================

CREATE TYPE "public"."repasse_state" AS ENUM (
  'CRIADO',
  'DECODIFICANDO',
  'DECODIFICADO',
  'SUBMETIDO',
  'AGUARDANDO_APROVACAO',
  'EM_LIQUIDACAO',
  'LIQUIDADO',
  'ERRO_DECODIFICACAO',
  'ERRO_TRANSFERENCIA',
  'EXPIRADO',
  'CANCELADO'
);

CREATE TABLE IF NOT EXISTS "public"."repasses" (
  "id"                  UUID DEFAULT gen_random_uuid() NOT NULL,
  "cobranca_id"         UUID NOT NULL,
  "usuario_id"          UUID NOT NULL,
  "valor"               NUMERIC(10,2) NOT NULL,
  "estado"              "public"."repasse_state" NOT NULL DEFAULT 'CRIADO',
  "versao"              INTEGER NOT NULL DEFAULT 1,
  "gateway_group_id"    TEXT,
  "gateway_item_id"     TEXT,
  "gateway_raw_status"  TEXT,
  "gateway"             TEXT,
  "tentativa"           INTEGER NOT NULL DEFAULT 1,
  "max_tentativas"      INTEGER NOT NULL DEFAULT 3,
  "erro_mensagem"       TEXT,
  "erro_codigo"         TEXT,
  "created_at"          TIMESTAMPTZ DEFAULT now(),
  "updated_at"          TIMESTAMPTZ DEFAULT now(),
  "liquidado_at"        TIMESTAMPTZ,
  CONSTRAINT "repasses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "repasses_cobranca_id_fkey" FOREIGN KEY ("cobranca_id")
    REFERENCES "public"."cobrancas"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "repasses_usuario_id_fkey" FOREIGN KEY ("usuario_id")
    REFERENCES "public"."usuarios"("id") ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE UNIQUE INDEX "idx_repasse_ativo_cobranca"
  ON "public"."repasses"("cobranca_id")
  WHERE "estado" NOT IN ('LIQUIDADO','CANCELADO','ERRO_DECODIFICACAO','ERRO_TRANSFERENCIA');

CREATE INDEX "idx_repasses_estado" ON "public"."repasses"("estado");
CREATE INDEX "idx_repasses_usuario_id" ON "public"."repasses"("usuario_id");
CREATE INDEX "idx_repasses_created_at" ON "public"."repasses"("created_at");

CREATE TRIGGER "update_repasses_updated_at"
  BEFORE UPDATE ON "public"."repasses"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE TABLE IF NOT EXISTS "public"."repasse_transicoes" (
  "id"          UUID DEFAULT gen_random_uuid() NOT NULL,
  "repasse_id"  UUID NOT NULL,
  "estado_de"   "public"."repasse_state" NOT NULL,
  "estado_para" "public"."repasse_state" NOT NULL,
  "motivo"      TEXT,
  "ator"        TEXT NOT NULL,
  "metadata"    JSONB DEFAULT '{}'::jsonb,
  "created_at"  TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT "repasse_transicoes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "repasse_transicoes_repasse_id_fkey" FOREIGN KEY ("repasse_id")
    REFERENCES "public"."repasses"("id") ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX "idx_repasse_transicoes_repasse_id" ON "public"."repasse_transicoes"("repasse_id");

GRANT ALL ON TABLE "public"."repasses" TO "anon";
GRANT ALL ON TABLE "public"."repasses" TO "authenticated";
GRANT ALL ON TABLE "public"."repasses" TO "service_role";
GRANT ALL ON TABLE "public"."repasse_transicoes" TO "anon";
GRANT ALL ON TABLE "public"."repasse_transicoes" TO "authenticated";
GRANT ALL ON TABLE "public"."repasse_transicoes" TO "service_role";
```

**Remover de `cobrancas`:**
- Coluna `status_repasse` (+ index `idx_cobrancas_status_repasse`)
- Coluna `data_repasse`
- Coluna `id_transacao_repasse` (+ FK `cobrancas_id_transacao_repasse_fkey`)
- Coluna `valor_a_repassar`

**Remover tabela** `transacoes_repasse` completa (+ FKs, indexes).

**Atualizar `anonymize_user_account`:**
- Adicionar sanitização da tabela `repasses` (limpar `erro_mensagem`, `gateway_group_id`, `gateway_item_id`, `gateway_raw_status`).

### 1.2 Atualizar `enums.ts` no backend

**Remover:** `RepasseStatus`, `TransactionStatus`, `PaymentGateway.MOCK`.

**Adicionar:**
```typescript
export enum RepasseState {
  CRIADO = 'CRIADO',
  DECODIFICANDO = 'DECODIFICANDO',
  DECODIFICADO = 'DECODIFICADO',
  SUBMETIDO = 'SUBMETIDO',
  AGUARDANDO_APROVACAO = 'AGUARDANDO_APROVACAO',
  EM_LIQUIDACAO = 'EM_LIQUIDACAO',
  LIQUIDADO = 'LIQUIDADO',
  ERRO_DECODIFICACAO = 'ERRO_DECODIFICACAO',
  ERRO_TRANSFERENCIA = 'ERRO_TRANSFERENCIA',
  EXPIRADO = 'EXPIRADO',
  CANCELADO = 'CANCELADO',
}
```

**Manter intactos:** `ProviderTransferStatus`, `C6TransferStatus`, `InterTransferStatus`.

---

## Etapa 2 — Core FSM Service

**Objetivo:** Criar `repasse-fsm.service.ts` — único ponto de entrada para criação/transição de repasses.

### 2.1 Criar `src/services/repasse-fsm.service.ts`

**Funções:**
1. `criarRepasse(cobrancaId, usuarioId, valor, gateway)` — INSERT estado `CRIADO`
2. `transicionar(repasseId, novoEstado, { motivo, ator, metadata })` — lock otimista + audit
3. `buscarRepasseAtivo(cobrancaId)` — repasse não-terminal da cobrança
4. `buscarPendentes(estados[], limiteHoras?)` — para monitor/retry
5. `cancelarRepasse(repasseId, motivo)` — atalho para CANCELADO

**Mapa de transições:**
```
CRIADO               → [DECODIFICANDO, CANCELADO]
DECODIFICANDO        → [DECODIFICADO, ERRO_DECODIFICACAO, CRIADO, CANCELADO]
DECODIFICADO         → [SUBMETIDO, CANCELADO]
SUBMETIDO            → [AGUARDANDO_APROVACAO, CANCELADO]
AGUARDANDO_APROVACAO → [EM_LIQUIDACAO, EXPIRADO, ERRO_TRANSFERENCIA, CANCELADO]
EM_LIQUIDACAO        → [LIQUIDADO, ERRO_TRANSFERENCIA, CANCELADO]
LIQUIDADO            → []  (terminal)
EXPIRADO             → [CRIADO, CANCELADO]
ERRO_DECODIFICACAO   → [CRIADO, CANCELADO]
ERRO_TRANSFERENCIA   → [CRIADO, CANCELADO]
CANCELADO            → []  (terminal)
```

**Lock otimista:**
- `UPDATE repasses SET estado=$novo, versao=versao+1 WHERE id=$id AND versao=$atual`
- Se 0 rows → conflito de concorrência → erro
- INSERT em `repasse_transicoes`
- `LIQUIDADO` → setar `liquidado_at`
- `CRIADO` (retry) → incrementar `tentativa`, limpar `gateway_group_id`

---

## Etapa 3 — Refatorar Workers e Jobs + Remover Mock Gateway

### 3.1 Refatorar `payout.queue.ts`
- `transacaoId` → `repasseId` em `PayoutJobData`

### 3.2 Reescrever `payout.worker.ts`
1. `transicionar(repasseId, DECODIFICANDO)`
2. Buscar PIX do motorista
3. `provider.realizarTransferencia()` → `endToEndId`
4. `UPDATE repasses SET gateway_group_id = endToEndId`
5. Catch: `transicionar(repasseId, ERRO_DECODIFICACAO)`

### 3.3 Reescrever `repasse-monitor.job.ts`
1. `buscarPendentes([DECODIFICANDO, DECODIFICADO, SUBMETIDO, AGUARDANDO_APROVACAO, EM_LIQUIDACAO])`
2. Crash recovery (sem `gateway_group_id` >1h → `CRIADO`)
3. Consultar C6 via provider → mapear → transicionar
4. `READ_DATA` → `transicionar(DECODIFICADO)` + `submeterGrupo` + `transicionar(SUBMETIDO)`

### 3.4 Reescrever `repasse-retry.job.ts`
1. Buscar `ERRO_DECODIFICACAO`, `ERRO_TRANSFERENCIA`, `EXPIRADO`
2. JOIN `usuarios` onde `status_chave_pix = VALIDADA`
3. `transicionar(CRIADO)` + `addToPayoutQueue()`

### 3.5 Remover Mock Gateway
- **DELETAR** `src/services/providers/mock.provider.ts`
- **DELETAR** `src/services/mock-automation.service.ts`
- **MODIFICAR** `src/services/payment.service.ts` — remover case `MOCK`, import `MockPaymentProvider`
- **MODIFICAR** `src/services/fee.service.ts` — remover entrada `MOCK`
- **MODIFICAR** `src/types/enums.ts` — remover `MOCK` de `PaymentGateway`

---

## Etapa 4 — Refatorar Services

### 4.1 `cobranca-pagamento.service.ts`

**`iniciarRepasse(cobrancaId)`:**
1. Validar `status = pago`
2. `repasseFsm.buscarRepasseAtivo(cobrancaId)` — já existe? `LIQUIDADO` → alreadyDone. Em progresso → already_in_progress.
3. Verificar chave PIX válida
4. `repasseFsm.criarRepasse(...)` — se PIX inválida: `ERRO_DECODIFICACAO` + motivo
5. `addToPayoutQueue({ cobrancaId, repasseId, ... })`

**`desfazerPagamento(cobrancaId)`:**
- Se repasse `LIQUIDADO` → negar
- Se em andamento → `cancelarRepasse()`
- Remover refs a `status_repasse`

**`reprocessarRepassesPendentes(usuarioId)`:**
- Buscar repasses com estado de erro → `transicionar(CRIADO)` + re-enfileirar

### 4.2 `mock-pagamento.routes.ts`
- Substituir queries a `transacoes_repasse` por `repasses`
- Usar FSM para forçar `LIQUIDADO`

---

## Etapa 5 — Adaptar Frontend

### 5.1 `van-control/src/types/enums.ts`
- `RepasseStatus` → `RepasseState` com novos valores

### 5.2 `van-control/src/types/cobranca.ts`
- Remover `status_repasse` do tipo `Cobranca`
- Adicionar tipo `Repasse`
- Cobrança: `repasse?: Repasse` populado via JOIN

### 5.3 `van-control/src/utils/formatters/status.ts`
- Atualizar labels e cores

### 5.4 Componentes UI
- `PassageiroCobranca.tsx`: `cobranca.repasse?.estado`
- `CarteirinhaCobrancas.tsx`: idem
- `CobrancasList.tsx`: idem
- `PaymentTimeline.tsx`: idem

---

## Plano de Verificação

### Compilação
```bash
npx tsc --noEmit                   # Backend sem erros de tipo
cd ../van-control && npm run dev   # Frontend compila
```

### Servidor
```bash
npm run dev   # Backend inicia sem crashes
```

### Fluxo Mock (rota dev)
1. `POST /mock-pagamento?id={cobrancaId}` → cria registro em `repasses` com estado `CRIADO`
2. Verificar `repasse_transicoes` no Supabase

### Banco
```sql
-- Confirmar remoção
SELECT column_name FROM information_schema.columns
WHERE table_name = 'cobrancas' AND column_name = 'status_repasse';
-- Deve retornar vazio

-- Confirmar criação
SELECT column_name FROM information_schema.columns
WHERE table_name = 'repasses';
-- Deve listar todas as colunas novas
```
