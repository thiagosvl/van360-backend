# 🗄️ Esquema de Dados (Faturamento e SaaS)

Este documento detalha a estrutura relacional para suportar a arquitetura gateway-agnostic, garantindo rastreabilidade, idempotência e suporte a múltiplos provedores.

---

## 1. Alterações em Tabelas Existentes

### 👥 Tabela `usuarios` (Motoristas e Admins)
Configurações de faturamento e identidade no gateway.

| Coluna | Tipo | Descrição |
| :--- | :--- | :--- |
| `gateway_id` | `text` | ID da conta/wallet do usuário no provedor (ex: Woovi). |
| `gateway_provider` | `text` | Provedor ativo (ex: `woovi`, `efi`). |
| `webhook_secret` | `text` | Chave de validação de integridade do webhook. |
| `config_faturamento` | `jsonb` | { `multa`: float, `juros`: float, `tolerancia`: int }. |

### 👥 Tabela `passageiros` (Configurações Financeiras)
| Coluna | Tipo | Descrição |
| :--- | :--- | :--- |
| `faturamento_habilitado` | `boolean` | Ativação individual do módulo. |
| `dia_vencimento` | `int` | Dia fixo para geração da cobrança. |
| `valor_mensalidade` | `numeric` | Valor base (snapshot p/ cobrança). |
| `gateway_customer_id` | `text` | ID do pagador no gateway atual. |

### 💰 Tabela `public.cobrancas` (Faturamento Individual)
| Coluna | Tipo | Descrição |
| :--- | :--- | :--- |
| `status` | `text` | `pendente`, `pago`, `vencido`, `cancelado`. |
| `valor_original` | `numeric` | Valor base da mensalidade. |
| `valor_encargos` | `numeric` | Soma de juros + multas (calculados pelo Core). |
| `gateway_id` | `text` | ID da cobrança ativa no momento (externo). |

---

## 2. Novas Tabelas de Apoio

### 🏷️ Tabela `billing_external_metadata` (Rastreabilidade)
Crucial para arquiteura agnóstica, permitindo que uma única dívida (`cobranca_id`) tenha múltiplos registros externos (em caso de re-emissão por expiração).

| Coluna | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | `uuid` | PK. |
| `cobranca_id` | `uuid` | FK -> `cobrancas.id`. |
| `gateway_provider` | `text` | `woovi`, `asaas`, `efi`, etc. |
| `external_id` | `text` | ID da cobrança no provedor. |
| `external_txid` | `text` | ID da transação (Pix/Boleto) no provedor. |
| `pix_copia_cola` | `text` | Código para pagamento. |
| `payload` | `jsonb` | Resposta bruta do gateway (debug). |

### 📜 Tabela `ledger_faturamento` (Livro Razão)
Garante a idempotência. Nenhum evento de pagamento é processado sem registro prévio aqui, usando o `gateway_txid` como chave única.

| Coluna | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | `uuid` | PK. |
| `cobranca_id` | `uuid` | FK. |
| `gateway_txid` | `text` | **Unique**. ID imutável da transação (ex: E2E ID do Pix). |
| `valor_recebido` | `numeric` | Valor total pago pelo passageiro (incluindo multas/juros). |
| `fee_gateway_pix_in` | `numeric` | Snapshot da taxa de liquidação no momento do pagamento. |
| `fee_gateway_split` | `numeric` | Snapshot da taxa de operação de split (se houver). |
| `fee_gateway_pix_out` | `numeric` | Snapshot da taxa de saque no momento do pagamento. |
| `fee_van360_fixed` | `numeric` | Valor fixo de split da Van360 (definido no momento do pagamento). |
| `valor_repassado` | `numeric` | Valor líquido enviado ao motorista. |
| `data_pagamento` | `timestamptz` | Confirmação do gateway. |

---

## 3. Configurações Internas (Chave/Valor)

### ⚙️ Tabela `configuracoes_sistema`
Armazena parâmetros globais do gateway que afetam o cálculo de split.

| Chave | Valor Exemplo | Descrição |
| :--- | :--- | :--- |
| `gateway_fee_pix_in` | `0.85` | Custo por recebimento PIX. |
| `gateway_fee_split` | `0.00` | Custo por operação de split. |
| `gateway_fee_pix_out` | `1.00` | Custo por transação de saque. |
| `gateway_fee_type` | `FIXED` | Tipo da taxa (`FIXED` ou `PERCENTAGE`). |

---

> [!IMPORTANT]
> **Auditoria Imutável**: As colunas `fee_*` no `ledger_faturamento` são permanentes. Se as taxas globais mudarem na tabela `configuracoes_sistema`, o histórico das transações passadas permanece intacto para conciliação contábil.

---

> [!IMPORTANT]
> **Consistência**: O `gateway_txid` no ledger deve ser o identificador final da transação financeira (ID de ponta a ponta), não o ID da cobrança, para evitar problemas com re-emissões.

---

> [!NOTE]
> **Última Atualização**: 2026-04-03
