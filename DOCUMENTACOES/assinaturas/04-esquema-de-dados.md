# 🗄️ Esquema de Dados: Assinaturas SaaS (Van360)

O banco de dados deve refletir o estado atual da assinatura do motorista e o histórico de transações.

---

## 1. Tabelas de Assinaturas (SaaS)

| Tabela | Coluna | Tipo | Descrição |
| :--- | :--- | :--- | :--- |
| **`assinaturas`** | `usuario_id` | UUID (PK) | Chave estrangeira para `usuarios.id`. |
| | `status` | `subscription_status_enum` | Status atual da conta. |
| | `plano_tipo` | `text` | `mensal` ou `anual`. |
| | `provider_name` | `text` | Nome do gateway (ex: `efi`). |
| | `provider_subscription_id` | `text` | ID da assinatura no gateway. |
| | `referral_code` | `UUID` (UNIQUE) | Código único para link de indicação. |
| | `data_vencimento` | `timestamp` | Fim do período pago/trial. |
| | `created_at` | `timestamp` | Data de adesão inicial. |

---

## 2. Tabelas de Transações e Histórico

| Tabela | Coluna | Tipo | Descrição |
| :--- | :--- | :--- | :--- |
| **`assinaturas_transacoes`** | `id` | UUID (PK) | Identificador da transação. |
| | `assinatura_id` | UUID (FK) | Vínculo com a assinatura. |
| | `valor` | `numeric` | Valor pago na transação. |
| | `status` | `text` | `pending`, `confirmed`, `failed`. |
| | `provider_txid` | `text` | ID da transação no provedor. |
| | `qr_expires_at` | `timestamp` | Data de validade do QR Code no gateway. |
| | `paga_em` | `timestamp` | Data/hora da confirmação do pagamento. |

---

## 3. Sistema de Indicações (Referral)

| Tabela | Coluna | Tipo | Descrição |
| :--- | :--- | :--- | :--- |
| **`assinaturas_indicacoes`** | `id` | UUID (PK) | Identificador do vínculo. |
| | `indicador_id` | UUID (FK) | Quem convidou. |
| | `indicado_id` | UUID (FK) | Quem foi convidado. |
| | `status` | `text` | `pending`, `rewarded` (quando o bônus foi pago). |
| | `recompensa_dias` | `int` | Snapshot da recompensa no ato da conversão. |
| | `desconto_pct` | `numeric` | Snapshot do desconto no ato da conversão. |
| | `convertido_em` | `timestamp` | Data da confirmação do primeiro pagamento. |
| | `created_at` | `timestamp` | Momento em que o convidado se cadastrou. |

---

---

## 4. Configurações Globais (System Settings)

| Tabela | Coluna | Tipo | Descrição |
| :--- | :--- | :--- | :--- |
| **`configuracoes_sistema`** | `chave` | `text` (PK) | Ex: `saas_referral_bonus_days`, `saas_referral_discount_pct`. |
| | `valor` | `text` | Valor configurado (armazenado como string/text). |

---

## 5. Transações e Conciliação (Livro Razão)
 
 ### 📜 Tabela `ledger_faturamento`
 Garante a idempotência total. Nenhum evento de pagamento (SaaS ou Cobrança) é processado sem registro prévio aqui, usando o `gateway_txid` como chave única.
 
 | Coluna | Tipo | Descrição |
 | :--- | :--- | :--- |
 | `id` | `uuid` (PK) | Identificador único do registro. |
 | `assinatura_id` | `uuid` (FK) | Vínculo com a assinatura do motorista (SaaS). |
 | `cobranca_id` | `uuid` (FK) | Vínculo com a cobrança de passageiro (opcional). |
 | `gateway_txid` | `text` (**Unique**) | ID imutável da transação (ex: E2E ID do Pix). |
 | `valor_recebido` | `numeric` | Valor líquido recebido. |
 | `data_pagamento` | `timestamptz` | Confirmação oficial do gateway. |
 
 ---
 
 ## 6. Estrutura de Enums (Sugerida)
```sql
CREATE TYPE public.subscription_status_enum AS ENUM (
    'trial',
    'active',
    'past_due',
    'canceled',
    'expired'
);
```

---

> [!IMPORTANT]
> **Última Atualização**: 2026-04-06
