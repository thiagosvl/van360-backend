# 💸 Split de Pagamentos e Repasses (Motoristas)

Este documento detalha a engenharia financeira do módulo de cobrança automática, garantindo que as taxas de gateway sejam cobertas e o lucro líquido da Van360 seja preservado de forma agnóstica.

---

## 1. Arquitetura de Divisão (Split)

O sistema utiliza o **Split Nativo** do gateway (Woovi) no momento da criação da cobrança. O objetivo é que a Van360 receba seu lucro líquido na **Conta Principal** e o motorista receba o saldo da mensalidade na sua **Subconta**, já descontadas as taxas.

### 📐 Fórmulas de Cálculo

Para cada transação de mensalidade paga:

1.  **Valor para o Motorista (Saldo Remanescente)**:
    > `Valor Pago (Total) - Lucro Fixo Van360 - Custos de Gateway (In/Out/Split)`

2.  **Lucro Fixo Van360 (Definido por Motorista)**:
    > `Taxa de Serviço Van360 (ex: 3,90) - (Custo Gateway Pix In + Custo Gateway Pix Out + Custo Gateway Split)`

> [!TIP]
> **Surplus (Juros e Multas)**: Toda e qualquer variação positiva no valor pago (multas e juros por atraso) é direcionada automaticamente para o **Motorista**. A Van360 recebe apenas o seu valor fixo de serviço acordado, garantindo transparência e justiça na relação motorista-passageiro.

---

## 2. Parametrizagem das Taxas

As taxas são divididas em duas camadas para permitir flexibilidade comercial e técnica:

### A. Camada de Negócio (Per Motorista)
Armazenada em `usuarios.config_faturamento` (JSONB):
*   **`taxa_servico_total`**: O valor total que a Van360 cobra por mensalidade liquidada (ex: R$ 3,90). Este é o valor que o motorista percebe como "custo do sistema".

### B. Camada Técnica (Configurações do Sistema)
Armazenada na tabela **`configuracoes_sistema`** (Chave/Valor):
*   **`billing_gateway_pix_in_fee`**: Custo fixo ou percentual do Pix In (ex: 0,85).
*   **`billing_gateway_pix_out_fee`**: Custo do saque da subconta para o banco externo (ex: 1,00).
*   **`billing_gateway_split_fee`**: Taxa de operação de split, se houver (ex: 0,00).

---

## 3. Fluxo de Execução (3 Etapas)

### 🧮 Exemplo Prático (Valores Reais)

**Cenário**: Mensalidade de R$ 200,00 | Taxa Gateway Pix In: 0,85 | Taxa Gateway Pix Out: 1,00 | Taxa de Serviço Van360 (configurada): R$ 3,90.

1.  **Pagamento**: Passageiro paga **R$ 200,00**.
2.  **Liquidação (Pix In)**: O gateway retém R$ 0,85. Sobra R$ 199,15.
3.  **Split Imediato**:
    *   **Van360 (Conta Master)**: Recebe **R$ 2,05** (R$ 3,90 - R$ 1,85 de taxas).
    *   **Motorista (Subconta)**: Recebe **R$ 197,10** (R$ 200,00 - R$ 2,05 - R$ 0,85).
4.  **Saque Automático (Pix Out)**: O sistema detecta o pagamento e dispara o saque imediatamente.
    *   **Processamento**: O gateway retém R$ 1,00 do saldo da subconta.
    *   **Recebimento Final**: O motorista recebe **R$ 196,10** líquidos em sua conta bancária externa via PIX.

```mermaid
sequenceDiagram
    participant P as Passageiro
    participant W as Woovi Gateway
    participant V as Van360 (Principal)
    participant M as Motorista (Subconta)
    participant B as Banco Externo (Motorista)

    P->>W: Paga Mensalidade (R$ 200)
    Note over W: Desconta Pix In (0,85)
    W-->>V: Split Plataforma (R$ 2,05)
    W-->>M: Split Motorista (R$ 197,10)
    Note over V: Webhook Pago recebido
    V->>W: Solicita Saque (Withdraw) da Subconta
    Note over W: Desconta Pix Out (1,00)
    W-->>B: Pix Final recebido (R$ 196,10)

> [!CAUTION]
> **Disponibilidade de Saldo**: O Pix Out imediato assume que o saldo na subconta do motorista é liberado instantaneamente pelo gateway após a liquidação do Pix In. Caso o gateway possua um "delay" de liquidação (mesmo de poucos segundos), o sistema deve tratar o erro de saldo insuficiente como um estado temporário e re-tentar o saque via Worker.
```

---

## 4. Tratamento de Falhas e Idempotência

### ❌ Falha no Pix Out (Repasse Final)
Se a solicitação de saque (`withdraw`) falhar (ex: chave Pix do motorista deletada):
1.  O dinheiro permanece **estacionado com segurança** na subconta do motorista na Woovi.
2.  A transação local no Van360 vai para o estado `REPASSE_FALHA`.
3.  O motorista é notificado para regularizar os dados.
4.  Após a atualização, o sistema dispara novamente os saques pendentes.

### 🛡️ Auditoria no Ledger
Cada liquidação gera um registro no `ledger_faturamento` com o detalhamento das taxas capturadas no momento do pagamento, garantindo rastreabilidade financeira total para o fechamento do mês.

---

> [!IMPORTANT]
> **Agnosticismo**: Caso o gateway seja alterado, basta atualizar os valores na tabela `configuracoes_sistema`. A lógica de negócio e o lucro líquido da plataforma permanecerão íntegros.
